# RUN-LEDGER — live resume anchor for the long build run

> **The live plan is the file the WAKE-REPORT's top block names** — as of 2026-09-29
> [RELEASE-READINESS-PLAN-2026-09-29.md](RELEASE-READINESS-PLAN-2026-09-29.md) (Colton's go), then
> [OVERNIGHT-PLAN-2026-09-06.md](OVERNIGHT-PLAN-2026-09-06.md) stage ③ (② MET 2026-09-30). [NEXT-QUEUE.md](NEXT-QUEUE.md) is spent
> (fallback §B/§D only).
>
> **Release batch (CLAUDE.md §7.2):** unreleased since **v0.163.0** (tagged 2026-10-02, published 2026-10-02T19:06:27Z):
> **59 commits**, corpus **44.7% (15,467)** at the tag → **44.6% (15,432)**; engine gains since the tag: **−35** (+46 gained, −81 false credit removed). The next tag
> comes after ~100 cards of gains (or a user-facing fix).
> Update this line when a slice lands or a tag cuts.
>
> **Read the first ~150 lines** (entries through 2026-09-04 are archived — see the footer). **Repaired 2026-09-30:** commit 26645a2a (2026-08-06)
> had inserted a byte-identical 16,069-line copy of this file's tail mid-line — a scripted `String.replace` whose
> replacement held `grep -v '\.md$'`, where JS expands `$'` to "the rest of the string". The copy is gone and the cut
> line rejoined; the repair was proven on 26645a2a itself (repaired = its parent + one contiguous 9-line insertion,
> the note that was meant). The lesson (gotchas): pass a replacer FUNCTION to `String.replace`, never a string.

> ## 🔧 2026-10-17 — FIX: mana that is not the permanent's own — loyalty abilities, quoted abilities, targets, a count or condition ahead of the add, costs no record pays (Chandra, Torch of Defiance; Roxanne, Starfall Savant; Springjack Pasture; Selvala, Explorer Returned) · **−35** (false credit removed) · snapshot native 15,462 → 15,427
> Suite **19,590** green (1 skipped) / 1,813 files. Lint 0 (CR citations: 0 of 10,441 name no rule). Flip-diff **0 gained / 35
> lost / 0 retiered** (34,620 cards; before = 5daf02e3 from an untouched `git archive` copy, after = this tree). Runtime
> fingerprint: **60 of 34,620 `manaProduction` reads change** — 55 now make no mana, 4 fall back to their plain line, 1 (The
> Eternity Elevator) goes from none to {C}{C}{C}. **Mutants 18/18** on assertions, restore byte-identical (sha256 of
> manaModel.js compared after each).
> · **The bugs** (found 10-16 by the mana-text slice; re-proved on 5daf02e3 through `manaSources`, `legalActionsForPlayer` and
>   `dispatchAction`; every text from the bundled oracle index). ① **Loyalty abilities read as mana sources**: the Add matcher
>   reads any "<cost>: Add …" line, and the phantom-mana gate's consumable list never named a loyalty cost, so "+1: Add {R}{R}."
>   was a tapless source the planner spent and the explicit tap offered, no loyalty paid, at any time (the commit tapped the
>   planeswalker, so once per untap). CR 606.2 makes it a loyalty ability and CR 605.1a says a loyalty ability is never a mana
>   ability. Enumerated with a script over the bundled oracle — **25 cards** (20 commander-legal): Chandra, Torch of Defiance /
>   Bold Pyromancer / Dressed to Kill / Flameshaper / Heart of Fire / Hope's Beacon / Legacy of Fire / Novice Pyromancer,
>   Domri, Anarch of Bolas / Chaos Bringer, Jaya Ballard, Koth of the Hammer, Liliana of the Dark Realms (her −6 emblem's quoted
>   Swamp grant read as her own {B}{B}{B}{B}), Lukka, Bound to Ruin, Sarkhan Unbroken, Sarkhan, Fireblood, The Aetherspark (ten of
>   any one colour), Ugin, Eye of the Storms, Vraska, Betrayal's Sting (a −2 Treasure grant read as her own), Xenagos, the
>   Reveler; not commander-legal: Planeswalkerificate, The Unluckiest Planeswalker, Thomil, the Destroyer, Tibalt, Wicked
>   Tormentor, Wrenn and One. ② **Roxanne, Starfall Savant** tapped for any colour: `stripCreatedTokenAbilities` takes only the
>   first quote of "with \"…\" and \"{T}: Add one mana of any color.\"". ③ **Springjack Pasture**'s "{T}, Sacrifice X Goats: Add X
>   mana of any one color." merged into its main record as a free any-colour tap (lands are exempt from the cost gate, and the
>   honest-main check's "any color" test misses "any one color"). ④ **Selvala, Explorer Returned**'s parley ("For each nonland
>   card revealed this way, add {G}") was a flat {G}, no reveal, no life, no draws.
> · **The fix — one per-line reader, `manaLineRefused`**, applied to `oracleForAdd` in `manaProductionImpl` ahead of every reader
>   (lands included). A "<cost>: … Add …" line goes when: the text before the colon holds anything outside the positive list
>   `PAID_MANA_COST_ITEMS` — {T} and mana pips (activationCost), a self-sacrifice, "Pay N life", "Tap N untapped <filter> you
>   control", "Sacrifice a creature", "Exile a card from your graveyard", "Exile this card from your hand", the storage and no-{T}
>   counter removals — after an ability word (CR 207.2c) and a self-included grant's preamble are set aside; that one rule refuses a
>   loyalty symbol (①), a colon inside a quoted ability behind a trigger or effect (②, and the quote family below), and every
>   unpaid cost (③); OR the effect has a target (CR 605.1a, 115.6 — the singular "target", so a copy rider's "choose new targets"
>   is not read); OR the sentence holding the first "add" opens "If" or "For each" (④), the vivid bundle excepted. {Q} is not in
>   the list (CR 107.6 — nothing untaps the source). The phantom-mana gate's negative consumable list is untouched; this is the
>   positive list in front of it. First drafts also carried a separate loyalty strip, a two-quote token strip, a widened gains
>   pass and a no-grant quote pass: each changed **0** corpus reads once `manaLineRefused` was in (measured by mutating each
>   away and re-running the runtime fingerprint), so all four were removed rather than shipped as dead weight.
> · **Every card whose mana changed** (runtime fingerprint, 5daf02e3 → this tree): the 25 loyalty cards above → no mana. Quoted
>   abilities → none: Roxanne, Old-Growth Troll and Harold and Bob, First Numens (an Aura-after-death grant to a Forest), Glorious
>   Sunrise (a modal "Target land gains …"), Princess Yue and Hydro-Man, Fluid Felon ("becomes a land and gains …"), Divergent
>   Growth (an instant). Targets → none: Deathrite Shaman, Red Death, Shipwrecker, Soulbright Flamekin (was eight {R} per {2}),
>   Soulbright Seeker (four {R} per {R} — a loop), Witch Engine (no control change). If / for each → none: Selvala, Explorer
>   Returned; Un: Mana Screw, Everythingamajig (the coin-flip variant), Rainbow Dash. Unpaid costs → none: Cryptex (collect
>   evidence), Deranged Assistant, Millikin, Manakin and Millikin (mill), Wall of Roots (the -0/-1 counter was never placed; the
>   commit tapped it instead), Gemstone Mine, Hickory Woodlot, Peat Bog, Remote Farm, Sandstone Needle, Saprazzan Skerry (the
>   counter was never removed nor the land sacrificed — free forever), Pili-Pala ({Q}); Un: Built Bear, Unique Charmed Pants.
>   To the honest plain line: Springjack Pasture any colour → {C}; Thornvault Forager two of any colours → {G}; Evendo, Waking
>   Haven {G} per creature (its "12+ |" station line, no counters) → {G}; Uthros, Titanic Godcore {U} per artifact → {U}. Gained:
>   The Eternity Elevator null → {C}{C}{C} (its "20+ |" line's unmodelled metric nulled the whole card; the runtime already
>   offered {C}{C}{C} as an extra line, so nothing new is produced, only the main record moved). Extra mana lines and activation
>   costs, corpus-wide: only those cards' rows change.
> · **Flip-diff: −35, every one a credit resting on a line no record pays.** native-mana → body-only (12): Deathrite Shaman,
>   Red Death, Shipwrecker, Witch Engine, Soulbright Flamekin (a target); Selvala, Explorer Returned, Mana Screw (if / for each);
>   Cryptex, Deranged Assistant, Millikin, Manakin and Millikin, Wall of Roots, Pili-Pala (an unpaid cost). land → land-partial
>   (23): six whose only mana line was free forever — Gemstone Mine, Hickory Woodlot, Peat Bog, Remote Farm, Sandstone Needle,
>   Saprazzan Skerry (they now make nothing); Springjack Pasture (now {C}); and 16 whose runtime mana is unchanged (each probed
>   alone, with its counters, on both trees: same planner records, same hand taps) but whose second line the land classifier
>   credited on a per-line read the runtime never offered — the five Vivid lands, Tendo Ice Bridge and Mirrodin's Core ("{T},
>   Remove a charge counter from this land: Add …"), Saltcrusted Steppe, Dreadship Reef, Calciform Pools, Molten Slagheap,
>   Fungal Reaches and Crucible of the Spirit Dragon ("Remove X storage counters"), The Secret Lair ("Say the secret word"), Arena
>   of Glory (exert), Tarnation Vista ("{1}, {T}: For each color among monocolored permanents …"). The planeswalkers' tiers come
>   from the loyalty classifier and do not move.
> · **Self-play decks this moves** (profile decks in AppData, all mainboard): Sarkhan, Fireblood — Joe: Did you say Dragons?;
>   Deathrite Shaman — Omnath: Teval, the Balanced Scale Test; Gemstone Mine — Colton: Killer Turts; Evendo, Waking Haven —
>   Colton: The Unbeatable Squirrel Girl; Uthros, Titanic Godcore — Joe: Captain America Shoot your Shot; Harold and Bob, First
>   Numens — Joe: Mothman Cometh. No seeded batch was run.
> · Witness `manaNotItsOwn.test.js` (51; 42 red at 5daf02e3, every one an AssertionError; the 9 controls green on both):
>   eight loyalty adders' parse, Chandra and The Aetherspark alone through the planner and the explicit tap, Koth beside three
>   Mountains, Chandra beside a Mountain (the Mountain taps by hand and for a cast); Roxanne + the Meteorite token control;
>   Springjack by hand and the planner with Goats; Selvala; the target five, Deathrite's empty graveyards, the Flamekin loop and
>   the Pyromancer's Goggles control; the unpaid-cost six, Thornvault, Evendo with three Elves, Hickory and Gemstone, The Eternity
>   Elevator; the quoted five; controls for every paid cost item (Mana Confluence, Springleaf Drum, Ashnod's Altar, Molt Tender,
>   Elvish Spirit Guide, a Treasure, Fountain of Cho, Pentad Prism), the self-included grants (Gemhide, Basal, Sachi), an ability
>   word and gate (Mox Opal), the vivid count (Bloom Tender), the "instead" riders (Incubation Druid, Command Mine), Tundra's
>   reminder-text ability, Llanowar Elves, a Forest. Fixture flips: manaModel.test.js and manaTierStaticResidue.test.js (Wall of
>   Roots — now no mana, body-only), landEntersWithCounters.test.js (Vivid Marsh, Hickory Woodlot, Gemstone Mine → land-partial),
>   storageCounterLands.test.js (Saltcrusted Steppe → land-partial) — each was credited on a per-line read of a line no record pays.
> · Mutants (18): the filter's application · the cost-residue rule · the target rule · singular "target" only · the if/for-each
>   rule · the vivid exception · reminder text read past · the ability-word prefix · the self-grant preamble · {Q} unpaid · each
>   paid item (self-sacrifice, pay life, tap-other, sacrifice a creature, exile from graveyard, exile from hand, storage removal,
>   no-{T} counter removal). Each mutant's corpus effect was measured too (from 1 row — {Q} — to 108 — reminder text).
> · ⚠️ Found, not fixed: ① **Meteor Crater** ("{T}: Choose a color of a permanent you control. Add one mana of that color.")
>   reads as the land fallback's {C}: wrong colour, and {C} on a board with no coloured permanent where it makes nothing. ②
>   `stripCreatedTokenAbilities` and the gains-form pass still take one quote / named subjects only — harmless now (the colon rule
>   refuses those lines first) but wrong as helpers. ③ The Vivid lands' "{T}, Remove a charge counter from this land: Add one mana
>   of any color." was never offered at runtime and is now no longer credited by the land classifier either; modelling it (the
>   commit already removes counters for the storage lands' lines) would return them to `land`. ④ Wall of Roots now
>   makes nothing: modelling its cost needs a -0/-1 counter the commit places (and no tap). ⑤ Pili-Pala's {Q} filter needs an
>   untap-symbol cost. ⑥ `powerRanker.producedColors` (deck ranking, not the engine) still reads Scryfall's `produced_mana`, which
>   lists a planeswalker's loyalty colours.

> ## 🔧 2026-10-17 — FIX: the death sites that bypassed the shared sacrifice — the Fading / Vanishing upkeep, the mobilized Warriors, a creature Saga, a sacrificed planeswalker · **±0** · corpus 15,494
> Suite **19,573** green (1 skipped) / 1,814 files. Lint 0 (CR citations: 0 of 10,451 name no rule). Flip-diff **0 / 0 / 0**
> (34,620 cards; before = 93250da2's code from an untouched git-archive copy, after = this tree), so every coverage count is
> unchanged. **Mutants 11/11** on assertions, restore byte-identical (sha256 of the seven engine files compared after each).
> Runtime only.
> · **The bugs** (the 10-16 slice's four, each re-proved on 93250da2 on a real board: `nextStep` into the upkeep or the draw step, a
>   declared attack run to the end step, `legalActionsForPlayer` + `dispatchAction`, `checkAllStateBasedActions`; every text from the
>   bundled oracle index). ① **`fading.applyFadeVanishUpkeep`** (CR 702.32a / 702.63a) built its own death entry with no replacement
>   flags: Blastoderm sacrificed at upkeep under Rest in Peace went to exile, yet Blood Artist triggered and a death was counted
>   (CR 700.4 — FALSE POSITIVE); an opponent's Misery's Shadow (the death-specific exile; a Lava Coil stamp cannot be live at that
>   upkeep) was not the destination; no sacrifice watcher fired (Korvold, and a noncreature's — Rejuvenation Chamber — FN).
>   ② **`tokens.applyMobilizeSac`** moved the Warriors to the graveyard by hand, then asked `destroyLethalCreatures`, which could no
>   longer see them: no dies trigger, no sacrifice trigger, no death (FN). ③ **`gameEngine.sweepFinishedSagas`** (CR 714.4) assumed a
>   Saga is never a creature: Urza's Saga under Living Plane was sacrificed at chapter III with no dies trigger, no death, no replaced
>   death logged under Rest in Peace (FN). ④ **A planeswalker sacrificed as a cost** (Claws of Gix, Spark Reaper) reached no
>   `checkPlaneswalkerDiesTriggers` (Cruel Celebrant — FN); the audit found the same gap at the single effect sacrifice (Sheoldred's
>   Edict's planeswalker mode) and at the legend rule (two Jace Belerens, CR 704.5j).
> · **The fix.** ① and ③ call **`costSacrifice.sacrificePermanentForCost`**: both happen where no resolution finalizer follows (the
>   Fading / Vanishing trigger is applied inline as the upkeep begins; CR 714.4 is a state-based action that doesn't use the stack),
>   and it is the one sequence that drains its own leave event — the effect-side `removal.sacrificeCreatureEffect` leaves a
>   noncreature's leave event to the finalizer, and fading.js cannot import removal.js anyway (removal → zones → enterReplacements →
>   fading is a cycle). Each Fading / Vanishing sacrifice is its own event (each permanent's own trigger), read off the live board
>   after a vanishing counter came off; the Saga is re-read live too. ② moves to **`removal.applyMobilizeSac`** (registered in
>   `removalResolvers`; tokens.js keeps the mint half and the sentinel parser — tokens cannot import removal, removal imports tokens):
>   the delayed trigger resolves inside a resolution, and "sacrifice them" is ONE event, so **`sacrificeCreaturesTogether`** — each
>   Warrior's death and sacrifice, a "one or more creatures die" watcher once (CR 603.1). ④ `sacrificePermanentForCost` and
>   `sacrificeCreatureEffect` send a planeswalker that is no creature (layer-aware types as it left, CR 603.10a) to
>   `checkPlaneswalkerDiesTriggers` after its leave event and before the sacrifice watchers (the batch sacrifice's and the destroy
>   effect's dispatch); `applyLegendRule` returns `deadPw` and `checkAllStateBasedActions` dispatches it. A planeswalker a
>   replacement exiled never died (the dispatch reads where the card went). Two wrong citations in the mobilize block fixed on the way
>   (CR 702.174 is Gift → 702.181a; 701.17 is Mill → 701.21a). ENGINE-SCAFFOLD §4.7 names the three sacrifice entry points.
> · **Every battlefield → graveyard move in the engine (the audit — `moveCardToZone` from "battlefield" toward "graveyard", plus every
>   `checkDiesTriggers` input):** the cost sacrifice (costSacrifice.js), the single and batch effect sacrifices (removal.js), the
>   destroy effect (spellEffects.applyDestroyEffect), the lethal-damage SBA (destroyLethalCreatures) and the legend rule's creatures —
>   all on `deathLookback`; the 0-loyalty SBA (destroyZeroLoyaltyPlaneswalkers → the planeswalker dispatch at all four callers);
>   Fading / Vanishing, mobilize, the Saga sweep, the legend rule's planeswalkers — fixed here; the Aura moves (an orphaned Aura when
>   its host leaves, gameState.detachPermanentFromAll; umbra armor's Aura, applyTotemArmor; CR 704.5m in sba.js twice; Animate Dead
>   with nothing to return; a departed player's Curses, learnSession; the replaced Roles, CR 704.5y) — an Aura is no creature (a
>   bestowed one is excluded), so no death is missed, and moveCardToZone records each leave event. `zones.applyZoneMove` only ever
>   moves to hand, library or exile; runProgram's tutor move is from the library or hand. Every `checkDiesTriggers` input is now a
>   `deathLookback` entry or `destroyLethalCreatures`' list — the Fading entry was the last hand-built one.
> · **AI / self-play** (the 30 profile decks in AppData, read for these cards; no seeded batch was run). Voice of Victory (Otharri
>   Test, Kellan of the west): its two Warriors now die and are sacrificed at the end step — neither deck has a death or sacrifice
>   watcher of its own, but an opponent's do fire now: Syr Konrad, the Grim (Teval Test, Mothman Cometh — 1 damage to each of its
>   opponents per Warrior), Mayhem Devil (Vihaan, Goldwaker — 1 damage per Warrior), and the any-seat deaths-this-turn tally counts
>   them. Reality Acid (Brago Blink — body-only, but its Vanishing sacrifice runs at every upkeep) now fires sacrifice watchers (Mayhem
>   Devil). Urza's Saga (Captain America, Wolverine, Earth Bent, cdh, Squirrel Girl) dies as a creature only when animated at its
>   sacrifice — Earth Bent's earthbend can do that (its earthbend return already fired off the leave event; now the death counts and
>   an opponent's Syr Konrad sees it). Planeswalkers: the only planeswalker-dies watchers in the decks are Carth the Lion (Atraxa
>   Superfriends — no trigger detected, body-only) and Cruel Celebrant (Vihaan, Goldwaker — a deck with no planeswalker), so no
>   profile game changes there. No profile deck holds a Fading / Vanishing creature.
> · Witness **`sacrificeDeathSites.test.js`** (21; 14 red at 93250da2, every one an AssertionError; the 7 controls pass on both):
>   Blastoderm under Rest in Peace / without it / beside an opponent's Misery's Shadow / with a fade counter left; Waning Wurm under
>   Rest in Peace and without; Rejuvenation Chamber (Disciple below Korvold); Voice of Victory's Warriors (Blood Artist ×2, Korvold ×2,
>   Vengeful Townsfolk ×1, two deaths) and under Rest in Peace; Urza's Saga under Living Plane, under Living Plane + Rest in Peace, and
>   a plain Saga; Claws of Gix and Spark Reaper sacrificing Jace Beleren (Cruel Celebrant, then Korvold), under Rest in Peace, and a
>   Sol Ring control; Sheoldred's Edict at the opponent's Jace and under Rest in Peace; the legend rule on two Jaces and under Rest in
>   Peace; the 0-loyalty parity control. The 108 test files that touch these paths and the full suite stay green unchanged.
> · The full suite ran before the last two edits (the witness's Misery's Shadow case replaced an unreachable Lava Coil-stamp case;
>   one fading.js comment); the witness, the 108 related test files, lint and all eleven mutants re-ran on the committed bytes.
> · Mutants (11): fading.js back on 93250da2 · the Fading sacrifice a bare graveyard move · the Warriors moved by hand · each Warrior
>   its own event (the batch watcher fires twice) · gameEngine.js back on 93250da2 · no planeswalker dispatch in the cost sacrifice ·
>   that dispatch after the sacrifice watchers · none in the effect sacrifice · the legend rule records no planeswalker · sba.js never
>   dispatches them · the cost sacrifice reads the printed type line (the Living Plane Saga).
> · ⚠️ Found, not fixed: ① **`removal.applyMintedLeave`** (Kiki-Jiki, Tempestra, Orthion, The Fire Crystal — "Sacrifice it at the
>   beginning of the next end step") sacrifices a doubler's extra tokens one at a time: probed, two tokens make Vengeful Townsfolk
>   trigger twice (a FALSE POSITIVE for a "one or more creatures die" watcher; `sacrificeCreaturesTogether` is the fix — not this
>   slice's bug, it never bypassed `deathLookback`). ② Mobilize's marker sacrifices every mobilized token at the first delayed trigger,
>   so two mobilize attackers make one batch, not two (an under-fire, FN). ③ The 0-loyalty SBA and the destroy effect read
>   planeswalker-ness off the printed card, not layer-aware (a planeswalker that is also a creature at 0 loyalty never dies as a
>   creature — FN). ④ CR 702.174 (Gift) is still cited for mobilize in coverage.js and triggers.js (×2), and for offspring (702.175)
>   in coverage.js — comments only.

> ## 🔧 2026-10-17 — FIX: a cast offer's `cmc` is the card's mana value — kicker, multikicker, bestow and strive no longer add to it, and a {2/X} pip counts 2 (CR 118.8d, 118.9c, 202.3f) · **±0** · corpus unchanged
> Suite **19,518** green (1 skipped) / 1,812 files, under the gate queue. Lint 0 (CR citations: 0 of 10,429 name no rule). Flip-diff
> **0 / 0 / 0** (34,620 cards; before = an untouched `git archive` of b51c65d0; native 15,462 of 34,584 snapshot names before and
> after). **Mutants 7/7** on assertions, each restored byte-identical (sha256). The stack guards were seen to fail: a dispatcher
> mutant that puts the paid cost on the stack card fails all three, on their counterspell assertions.
> · **The report** (the 10-16 citations entry below): a kicked cast's `cmc` was printed + kicker and a bestowed cast's the bestow
>   cost, "whether it reaches a spell's MV on the stack is unverified". **It doesn't.** The dispatcher puts the card (`castCard`) on
>   the stack, never the offer's `cmc`, and every stack reader takes the card's `cmc`: the mana-value counters
>   (`stack.counterMvOk`, `spellEffects.spellMatchesCounterFilter` — Spell Snare, Thoughtbind, Disdainful Stroke, Minor Misstep),
>   `stack.stackSpellManaValue` (Mana Drain, Imp's Mischief), the cast-trigger mana-value filter (`triggers.spellManaValue`),
>   cascade (`cascadingSpellManaValue`). The offer's `cmc` has two readers, both the AI's: `opponentAI.scoreCastTier` /
>   `scoreByRole` (aggro's cheap body at 2 / 3, ramp's finisher at 7+) and `pickCastAction`'s tie-break (and the M5.1 ranking it
>   records). `manaUntapLine` reads only activation offers; `pickCounterCast` reads the stack object's paid `cost` (a threat
>   heuristic) — both unchanged.
> · **The fix** (`legalChoices.js`). Every cast offer keeps `base.cmc`, the printed mana value: the kicked creature, spell and
>   Aura, every multikick count (it grew by the multikicker per kick), the bestow cast (it was the bestow cost), and a strive cast
>   with extra targets (it was the whole payable cost, tax included) — the rule the additional-mana-cost, emerge, flashback and
>   alt-cost casts already followed. `totalCmc` counts a hybrid symbol by its largest component (CR 202.3f): the 22 {2/X} cards
>   (Spectral Procession, Flame Javelin, Reaper King …) were offered at about half their mana value. `totalCmc` also feeds the
>   flashback cast's printed MV, `manaValueOf`'s no-cmc fallback and the equip-override comparison.
> · **Corpus effect** (an offer probe over the 339 nonland kicker / multikicker / bestow / strive / {2/X} cards, archive vs fix):
>   146 cards' offers change `cmc`; afterwards every offer reads the printed mana value (an X cast reads printed + X, CR 202.3e —
>   Nyxborn Hydra). No tier moves.
> · **Decks** (the three profiles' decks): Everflowing Chalice (Otharri Test), Galadriel's Dismissal (Otharri Test, Shalai and
>   Hallar Test, Light-Paws Voltron) and Divine Resilience (Otharri Test) change `cmc`; their score is the same in every archetype
>   (Chalice is ramp; the other two are neither creatures nor 7+), so only the tie-break among equal-score casts moves. Springheart
>   Nantuko's bestow cost equals its mana value; Nyxborn Hydra's bestow and the kicks of Sowing Mycospawn and Inscription of
>   Abundance are not offered; teamwork casts already kept the printed value. **⚑ Epoch:** AI picks can change in a game holding a
>   kicker, multikicker, bestow, strive or {2/X} card (scores in aggro / ramp, tie-breaks anywhere); the action set does not.
> · **{2/X} audit:** goldfish.js `manaValueFromCost` and library.js `manaValueOfCard` (clash) are NOT changed — no real card reaches
>   them. Every card the app builds carries a numeric cmc (`cardIndex.publicCard` `cmc ?? 0`, the live fallback the same,
>   `learnDeckEnrich` `cmc ?? full.cmc ?? 0`, self-play enriches through it; the saved decks hold names only); all 22 {2/X} cards
>   are layout normal; and `opponentAI` calls `detectArchetype(aiDeck, {})` with empty card data, so goldfish's fallback there only
>   ever reads "". modalDfc `faceManaValue` has the same arithmetic and needs a {2/X} modal DFC face (none exists).
> · Witness `castManaValue.test.js` (18): 13 failed on b51c65d0 on assertions (the offers, the scorer, two aggro / tie-break
>   picks), 5 held (four stack guards and the unkicked control). Four old pins asserted the bug, each citing CR 202.3b (the
>   back-face rule): kicker.test ×2, bubbleSnare.test, kickerSpellEffect.test → the printed value.
> · ⚠️ Found, not fixed (queued): **the mana-value counters and the cast-trigger filter read the card's `cmc`, not
>   `stackSpellManaValue`.** An X spell on the stack counts X as 0 (CR 202.3e: the chosen X) — probed: Hungering Hydra cast for X=5
>   (stack MV 6) is offered to Thoughtbind ("4 or less", an illegal target) and not to Disdainful Stroke; a split half or an
>   Adventure reads the whole card's cmc (`splitFaceCards` / `adventureFaceCard` spread the card; CR 202.3d), so a "N or greater"
>   or exact counter can be offered against a half that is below it. Fix: route both counter filters through
>   `stackSpellManaValue(stackObj)` and give the cast-trigger filter the cast's X and face. The strive citation CR 702.106 (Hidden
>   Agenda) remains in parser.js and strive.test.js (corrected here in legalChoices to CR 207.2c, the ability-word list).

> ## 🏷️ 2026-10-17 — FIX: every Academy action reads as words (activate / crew / cycle / loyalty and the 13 other unlabelled kinds; the no-board prompt; "You's turn"; raw seat ids) · Stomp withheld on purpose · **±0** · corpus unchanged
> Suite **19,518** green (1 skipped) / 1,814 files under the gate lock. Lint 0 (CR citations: 0 of 10,404 name no rule). Flip-diff
> **0 / 0 / 0** (34,620 cards; before = an untouched `git archive` of b51c65d0); native 15,462 of 34,584 snapshot names before and
> after. **Mutants 17/17** on assertions, restore byte-identical by sha256. Engine behaviour and AI play unchanged (the one engine
> edit is an added export).
> · **The bugs** (the cast-chooser entry's found-not-fixed list, 2026-10-16). ① `actionLabel` worded six kinds; activate-ability,
>   crew-vehicle, cycle, activate-loyalty and 13 more dispatcher kinds fell to the de-kebabed kind ("activate ability"), so
>   Prodigal Pyromancer's six targets read alike. ② LearnView's no-board `DecisionPrompt` labelled options `opt.name || opt.kind`:
>   "pass-priority", "crew-vehicle", a cast without its target. ③ `boardContext` glued "'s" onto the seat label — "You's turn" in
>   the text Ask Jace and the Arbiter read. The same pattern built from raw ids: LearnBoard's focused opponent board ("ai's
>   Battlefield / Lands", "viewing ai", the summary's name fallback) and the hand-reveal panel ("ai's hand is revealed").
>   ④ A single-defender attack read "Attack  with X" (double space).
> · **The fix (UI, plus one export).** `actionLabel` words all 23 kinds of the new `actionDispatcher.ACTION_KINDS` (the HANDLERS
>   keys) from each action's own fields: "Activate <card>: <abilityText> → <target> (<mana>, {T}, tap N untapped creatures,
>   exile N cards from your graveyard, pay N life, {E}, sacrifice it / exile it, remove a counter)" — Equip's text carries its
>   cost, so no parens; "Crew <Vehicle> (crew N, tap K creature(s))"; "Cycle <card> ({U})" or "(pay 2 life)"; "Activate <walker>
>   <±N: text> → <target>"; suspend, plot, turn face up, the graveyard / hand / Doubling Cube abilities, companion, discover,
>   free-cast / cascade / cast-from-among each get theirs. `manaCostText` writes a parsed cost back as pips (X dropped once
>   folded into generic). `seatPossessive(id, { start })` in seatLabels.js is the one possessive ("your" / "Your", "<label>'s");
>   boardContext, the LearnView turn line, LearnBoard and the hand-reveal panel use it. `DecisionPrompt` (now exported) uses
>   `actionLabel`; its separate "→ seat" suffix is gone (the label names the defender). The bar's tooltip is the label, not the kind.
> · **Stomp (Bonecrusher Giant) — withheld on purpose, left as is.** Real board (three Mountains, an opposing Grizzly Bears): the
>   engine offers only "cast-spell Bonecrusher Giant", the live app too. `actionsCastAdventureFromHand` offers the Adventure only
>   when the whole card is native (CR 715.3), and both halves are parked: Stomp's "Damage can't be prevented this turn." — the
>   engine keeps prevention shields and models only the static "Combat damage can't be prevented", so resolving Stomp as plain
>   2 damage would let a shield prevent it (an FP); its damage sentence alone IS native — and the Giant's "becomes the target of
>   a spell … that spell's controller" trigger (the creature face is body-only). Pinned in `bonecrusherStomp.test.js`, seen to
>   fail with the CREED gate line removed.
> · **Live check** (`next dev -p 3107`, scratch data root with the AppData oracle as the reference dir, a seeded 1v1 puzzle): every
>   label above rendered in the bar and the "+12 more" sheet; "Opponent's Battlefield / Lands", "viewing Opponent", "Your
>   Battlefield", the summary "Opponent"; bar tooltips carry the label. Not reachable live: the no-board prompt (the API always
>   sends a board) and Ask Jace's context (needs a model) — both covered by render / unit tests.
> · Witnesses: `actionLabelKinds.test.jsx` (13 — engine-backed labels on real oracle text, the every-kind guard against
>   `ACTION_KINDS`, the cost fields, the no-board prompt render, the hand-reveal seat), `seatLabels.test.js` (2),
>   `boardContext.test.js` ("your turn"), `bonecrusherStomp.test.js` (3). Fingerprint snapshot: HandDiscardPanel "ai's" →
>   "Opponent's" (the one intended line).
> · ⚠️ Found, not fixed: `narrator.narrateAction` has no case for crew-vehicle ("Take action") or suspend / discard-ability /
>   the graveyard and hand abilities / double-mana-pool ("Take action: <name>"), and its `formatCost` writes a zero cost as "0"
>   ("Cycle [[Street Wraith]] for 0"). `LearnLogEntry` (the Recent actions feed and the replay scrubber) and LearnBoard's game log
>   show the raw kind and seat id ("ai1 · activate-ability"). A crew label can't name the creatures it taps — the action carries
>   ids only. The Adventure gate needs BOTH halves native although the permanent half already casts body-only from hand; relaxing
>   it to "the Adventure half is native" is a design call (moot for Bonecrusher, whose Stomp is itself parked).

> ## 🔧 2026-10-16 — FIX: one cost sacrifice — the activated-ability / additional-cost sacrifice and the mana-cost sacrifice are one helper (`costSacrifice.sacrificePermanentForCost`): a replaced death is logged, a noncreature's watchers stack in one order · **±0** · corpus 15,494
> Suite **19,488** green (1 skipped) / 1,810 files. Lint 0 (CR citations: 0 of 10,372 name no rule). Flip-diff **0 / 0 / 0**
> (34,620 cards; before = cf0cd5cb's code, after = this tree), so every coverage count is unchanged. **Mutants 10/10** on
> assertions, restore byte-identical (sha256 of the three engine files compared after each).
> · **The report, re-proved on cf0cd5cb (it was half stale).** Two 10-16 sessions found `actionDispatcher.sacrificePermanentForCost`
>   building a flag-less death entry: Carrion Feeder eating Memnite under Rest in Peace fired Blood Artist and counted a death. That
>   half was already closed on master by the type-line audit (18402016 moved the function onto `gameState.deathLookback`): probed
>   through `legalActionsForPlayer` + `dispatchAction` on cf0cd5cb, Memnite goes to exile, no Blood Artist trigger, tally 0, and a
>   Blightsteel Colossus is shuffled with no trigger. What was still wrong was the drift between the two copies of the sequence: the
>   cost copy logged no replaced death (no `creature-exiled-instead` / `creature-shuffled-instead` event, so the narration never said
>   "Memnite is exiled instead of dying (sacrifice)" — the mana copy, the destroy and the sacrifice effects all log one), and the two
>   drained a noncreature's leave event on opposite sides of its sacrifice watchers (cost: leave watchers, then sacrifice watchers;
>   mana: the reverse) — a Clue and a Treasure sacrificed beside Disciple of the Vault and Korvold stacked in opposite orders.
> · **The fix.** New `app/src/lib/learn/costSacrifice.js` (imports gameState, layers, triggers only; in no import cycle) holds THE
>   cost sacrifice: layer-aware types as it left (CR 603.10a), `deathLookback` for a creature, the death-specific exile as the
>   destination, the replaced death logged (`deathEventKind`, `via: "sacrifice"`), the leave event drained first (CR 603.3b —
>   `checkDiesTriggers`' first line for a creature, `checkLeavesTriggers` otherwise; the cost path's documented order, which the Saga
>   sweep mirrors), dies triggers for a real death only (CR 700.4), sacrifice triggers with `lkiTypes` for every sacrifice
>   (CR 701.21a). `manaModel.sacrificeForManaCost` and actionDispatcher's copy are deleted; every caller imports the one helper.
>   ENGINE-SCAFFOLD §4.7 names it.
> · **Every cost-sacrifice site (all now the helper):** actionDispatcher — the spell's additional cost, single victim (Village
>   Rites, Bone Splinters, Natural Order, Fling: `sacCreatureId`) and count-of-N (`sacCountIds`); the alternative costs
>   `sacrificeCreature` and `sacrificeLands` (Fireblast's Mountains); emerge's victim; an activated ability's self-sacrifice
>   (`sacSelf` — Clue, Food, Mind Stone), its chosen victim (`sacCreatureId` — Carrion Feeder, Viscera Seer,
>   Altar of Dementia) and its "Sacrifice N <subtype>" (`sacCountIds`); manaModel.commitManaTap — an Altar's victim
>   (`sacrificesCreature`) and a one-shot source's self-sacrifice (`sacrifices` — Treasure, Lotus Petal, Eldrazi Spawn, a Basal
>   grant). The resolution-time sacrifices (edicts, sac-unless-pay — Bog Elemental, "you may sacrifice … if you do", the
>   end-of-combat sacrifice, sacLand, Champion's fallback) go through `removal.sacrificeCreatureEffect` /
>   `sacrificeCreaturesTogether`, already on `deathLookback` with the replaced-death log.
> · **AI / self-play.** The cost-path change is log-only (gameAnalysis counts `creature-dies`; nothing reads the two replaced kinds
>   but the narrator). The play change is the mana path's noncreature order: a Treasure (Gold, Lotus Petal, Crystal Vein's sac
>   line, any one-shot noncreature mana source) whose controller also has a leave watcher that sees it (Disciple of the Vault,
>   Marionette Master, its own "put into a graveyard" trigger) AND a sacrifice watcher (Korvold, Mayhem Devil) now stacks the
>   sacrifice watcher on top. A seeded batch (80 commander games — base seed 7, 10 per pod, the 30 profile decks, default AI;
>   base = cf0cd5cb's tree, after = this tree): 77 logs byte-identical, 3 reordered — seeds 2654435768 (Omnath / Vihaan / cdh /
>   Slivers), 3781345310 and 3541994918 (Nekusar / Atraxa / Omnath / Vihaan): Vihaan, Goldwaker cracks a Treasure beside Nadier's
>   Nightblade (a token leaves) and Captain Lannery Storm / Mayhem Devil (a sacrifice), and the triggers resolve in the new order —
>   the same log events (ids aside), eliminations, winner, turn count and tick count. No new replaced-death event fired in the 80
>   (no pod paired a cost sacrifice with Rest in Peace, a death-exile static or a shuffle-instead creature); a 16-game batch (seed
>   1, 2 per pod) was byte-identical. The full suite ran on this tree before the slice's dates were set in three comments; the six
>   sacrifice test files, lint and the ten mutants re-ran on the committed bytes.
> · Witness `costSacrificeDies.test.js` (13; 7 red at cf0cd5cb, every one an AssertionError — the replaced-death log ×5, the
>   Altar/Feeder parity, the Treasure/Clue order; the other 6 are controls that pass on both): Carrion Feeder + Memnite under Rest
>   in Peace (exile, no drain, tally 0, Korvold still sees the sacrifice, logged) and without it (graveyard, one drain, tally 1);
>   Doomed Traveler's own dies trigger; Blightsteel Colossus alone and under Rest in Peace (shuffled, logged as shuffled); Lava Coil's
>   stamp (exile); an animated Swamp under Living Plane (a creature death and a creature sacrifice — Smothering Abomination); a Clue
>   and Mind Stone (sacrifice watchers, no death, Disciple below Korvold); Village Rites under Rest in Peace and without; the parity
>   pair. Comment references to the old locations updated (abilities.js, removal.js, sacCostSelfPiG.test.js,
>   manaCostSacrificeDies.test.js).
> · Mutants (10): no replaced-death log · the leave drain after the sacrifice watchers (the old mana order) · no leave drain for a
>   noncreature · no dies triggers · the printed creature test · the death-specific exile ignored · no sacrifice triggers · no
>   `lkiTypes` for them · actionDispatcher back on cf0cd5cb (its own copy) · manaModel back on cf0cd5cb (its own copy).
> · ⚠️ Found, not fixed (not cost sacrifices — the seventh death site and two more, each its own slice):
>   ① **`fading.applyFadeVanishUpkeep` builds a hand-made death entry with no replacement flags** — a FALSE POSITIVE, probed on this
>   tree: Blastoderm sacrificed at upkeep (no fade counter left) under Rest in Peace goes to exile, yet Blood Artist triggers and a
>   death is counted (CR 700.4); a death-specific exile (Lava Coil's stamp) is not honoured as the destination; a shuffle-instead
>   fading creature would "die" too; and no sacrifice watcher fires (Korvold — FN). Route it through `deathLookback` +
>   `deathEventKind` + `checkSacrificeTriggers` (the helper's sequence; mind the batch's one `checkDiesTriggers`).
>   ② `tokens.applyMobilizeSac` moves the mobilized Warriors to the graveyard and then asks `destroyLethalCreatures`, which can no
>   longer see them: no dies trigger, no sacrifice trigger, no death tally (probed — FN, the safe direction).
>   ③ `gameEngine.sweepFinishedSagas` (CR 714.4) assumes a Saga is no creature: an animated Urza's Saga (Living Plane) sacrificed
>   at its last chapter fires no dies trigger and logs no replaced death (FN).
>   ④ A planeswalker sacrificed as a cost (a "Sacrifice a permanent" cost) reaches no `checkPlaneswalkerDiesTriggers` — the batch
>   effect sacrifice does (FN; the single effect sacrifice skips it too).

> ## 🔧 2026-10-16 — FIX: mana text the engine read past — Ancient Tomb's damage, Mox Amber's legends, the commander's color identity, the "could produce" lands · **±0** · corpus 15,494
> Suite **19,514** green (1 skipped) / 1,810 files. Lint 0 (CR citations: 0 of 10,393 name no rule). Flip-diff **0 / 0 / 0**
> (34,620 cards; before = cf0cd5cb's code from an untouched git-archive copy, after = this tree), so every coverage count is
> unchanged. **Mutants 16/16** on assertions, restore byte-identical (sha256 of manaModel.js compared after each). Runtime only:
> the tier of every card named here is unchanged.
> · **The bugs** (re-proved on cf0cd5cb through `legalActionsForPlayer` + `dispatchAction`; every text read from the bundled
>   oracle index). ① **Ancient Tomb** ("{T}: Add {C}{C}. This land deals 2 damage to you.") made {C}{C} with no damage on both
>   paths: the single-ability painland arm took ONE coloured symbol, so a colourless bundle fell to the bare parse. As a "plain
>   colourless" record the planner also tapped it FIRST for generic, ahead of a Forest. **Tomb of Urami**'s "deals 1 damage to
>   you if you don't control an Ogre" was excluded as unmodelled, so it was painless on every board. ② **Mox Amber** ("any color
>   among legendary creatures and planeswalkers you control") made all five, on an empty board too. ③ **Command Tower, Arcane
>   Signet, Commander's Sphere, Path of Ancestry, Hidden Hideout, Command Mine** ("any color in your commander's color identity")
>   made all five, with no commander at all too (CR 903.4f: the quality is undefined and that part does nothing). Arcane Signet and
>   Fellwar Stone sat in `KNOWN_ROCKS` as five-colour rocks, a table read BEFORE the oracle parse. ④ Found on the way, the same
>   laundering: **Exotic Orchard, Fellwar Stone, Quirion Explorer, Sylvok Explorer** ("any color that a land an opponent controls
>   could produce", CR 106.7), **Harvester Druid** ("…a land you control…") and **Star Compass** ("…a basic land you control…")
>   all made any of the five; Reflecting Pool and Incubation Druid beside a Command Tower read the Tower's five.
> · **The fix — one colour-set reader, one damage rider.** `parseAddClause` gains arms ahead of the free any-colour arm, each
>   stamping `colorsAmongSpec`: `legendaryCreaturesAndPlaneswalkersYouControl`, `commanderColorIdentity`, and the could-produce
>   kinds (`landsYouControlCouldProduce` / new `landsOpponentsControlCouldProduce`, with `colorsOnly` / `basicOnly`).
>   `manaSources` narrows every spec through ONE switch, `colorsAmongFor` (Plaza's and Incubation Druid's inline blocks folded
>   in; an unknown kind is empty, never the placeholder five); an empty set drops the main record. The identity is
>   `commanderIdentity.commanderColorIdentityOf` (the seat's game-start stamp ∪ the command zone; partners union; colourless
>   or unknown → nothing). `landsCouldProduce` is the CR 106.7 read for both sides: a land's own production plus granted basic
>   types; a board-derived land is skipped (no recursion), except a Command Tower, whose set is ITS controller's identity.
>   The painland arm now takes any one symbol repeated (amount = count), so Ancient Tomb is `painColors ["C"]`, `painAmount 2`;
>   a printed "if <condition>" rides as `painCondition` when the intervening-if evaluator can answer it, and `manaSources` drops
>   the damage only while it is false (an unanswerable condition keeps the damage — worse than printed, the safe side). Damage
>   from a source without infect is life lost (CR 120.3a): `tapRecordFor` → `painLife` → `commitManaTap`, on the planner's tap and
>   the explicit tap alike. A painful record is never `tapAny`'s plain colourless, so a Forest pays a {1} before the Tomb.
>   Arcane Signet and Fellwar Stone left `KNOWN_ROCKS` (a copy with no oracle text now makes nothing — an under-count).
> · **Checked, no change needed.** City of Brass's damage is its own becomes-tapped trigger (④-AB), queued by the tap on both
>   paths — pinned as a control. Talismans, Grand Coliseum, Tarnished Citadel and the two-line painlands already carried pain.
>   Path of Ancestry's scry stays a modeled `spentRider` and it stays off the hand tap (cf0cd5cb's rule).
> · **Self-play decks this moves** (profile decks in AppData): Ancient Tomb — cdh, Kinnan Mana Overload, Killer Turts, The
>   Unbeatable Squirrel Girl; Mox Amber — cdh, Kinnan, Believe it!, Light-Paws Voltron, Atraxa Superfriends; Exotic Orchard —
>   Nekusar Wheels, Atraxa, Mothman Cometh, Jurassic Ramp, Hulk Smash, Halfshell heroes; Fellwar Stone — Otharri Test, Kinnan.
>   Command Tower (23 decks), Arcane Signet (22), Path of Ancestry (4 + 1 sideboard) and Hidden Hideout (3) now make only their
>   commander's colours — every self-play commander carries `colorIdentity` (31 of 31 checked through `toRunnerDeck`), so these
>   only lose off-identity colours. No seeded batch was run.
> · Witness `manaDroppedText.test.js` (39; 31 red at cf0cd5cb, every one an AssertionError): Ancient Tomb's parse, hand tap,
>   planner cast, planner-parity and generic order (+ the Sol Ring control); Tomb of Urami with and without an Ogre on both paths;
>   City of Brass control; Mox Amber alone / Isamaru / Jace Beleren / Honden / a Bear / an opponent's legend + parity; the four
>   identity sources on a mono-green commander and three with none, Path planner-only, partners, a colourless and an unknown
>   commander, the commander on the battlefield, parity, the parse of all six; Exotic Orchard (opponent Forest / none / Wastes /
>   another Orchard / its own Island / an opponent's Command Tower), Fellwar Stone, the Explorers, Star Compass (Forest / Tundra /
>   Wastes), Harvester Druid, Reflecting Pool + Tower, and the Incubation Druid and Forest controls. Fixture corrections:
>   pathOfAncestry.test.js's commander gains `colorIdentity` (its red Probe Bolt turns green; the no-commander case now asserts no
>   mana), landQuotedGrantMana.test.js's Command Power Plant board gains a commander, painland.test.js's Tomb of Urami pin flips.
> · Mutants (16): Ancient Tomb's bundle arm · the condition parse · the condition stamp · the condition gate · the Mox Amber arm ·
>   its creature/planeswalker filter · the identity arm · no commander as five · Arcane Signet and Fellwar Stone back in
>   KNOWN_ROCKS (2) · the could-produce arm · opponents' lands read as the controller's · basicOnly · colorsOnly · the Tower in
>   could-produce · an empty set keeping the placeholder.
> · ⚠️ Found, not fixed: ① **19 commander-legal planeswalkers' loyalty "Add" abilities are mana sources** in `manaSources` — no
>   loyalty paid, any time, at any speed (the commit then taps the planeswalker, so once per untap); CR 605.1a says a loyalty
>   ability is never a mana ability (Chandra, Torch of Defiance: `{R}{R}`; The Aetherspark: ten of any colour; Liliana of the Dark
>   Realms reads her emblem's quoted grant as her own `{B}{B}{B}{B}`); in a profile deck: Sarkhan, Fireblood (Did you say
>   Dragons?). ② **Roxanne, Starfall Savant** taps for any colour off her Meteorite token's quoted
>   "{T}: Add one mana of any color." (the created-token strip misses a two-quote chain). ③ **Springjack Pasture** ("{T},
>   Sacrifice X Goats: Add X mana of any one color") reads as a free any-colour tap. ④ **Selvala, Explorer Returned**'s parley
>   reads as a flat {G}. ⑤ Under-reads (safe): Murmuring Bosk's painful {W}/{B} line is never offered; a Command Tower made a
>   Swamp by Urborg loses the granted {B} when it is off-identity (the narrowing replaces the merged colours — Plaza already did
>   this); Exotic Orchard facing only an opponent's Exotic Orchard makes nothing where CR 106.7's example lets it copy what that
>   Orchard could make; the could-produce read ignores a land's chosen colour (Thriving lands); `opponentAI`'s land pick still
>   reads the placeholder five for every `colorsAmongSpec` source.

> ## 🔧 2026-10-16 — FIX: "this turn" is not "this creature" — a trigger condition's bare "this" no longer makes it the card's own event (Maeve, Insidious Singer drew whenever she attacked) · **±0** · corpus 15,494 (unchanged)
> Suite **19,446** green (1 skipped) / 1,808 files. Lint 0 (CR citations: 0 of 10,373 name no rule). Flip-diff **0 / 0 / 0** (34,620 cards; before = an
> untouched `git archive` of 86389b97); native 15,465 of 34,584 snapshot names before and after. Runtime fingerprint identical
> (34,620 rows). **Mutants 5/5** on assertions, restore byte-identical.
> · **The bug** (found by the 10-16 face-up-watcher session). `classifyCondition` computed `selfRef = /\bthis\b/.test(c) || <name>`,
>   so any condition holding "this turn" or "this way" read as SELF-referential and the self arms claimed it: "Whenever that
>   creature attacks one of your opponents this turn, you draw a card" — the rider inside Maeve's goad ability — was an
>   attacks/self trigger, natively routed, so Maeve drew a card every time SHE attacked. Measured, not estimated: detectTriggers
>   over all 34,620 real cards through two module graphs (the archive vs the fix) — **26 cards, 26 descriptors**, every one a
>   bare self trigger (attacks/self 10, dies/self 12, etb/self 4; 12 routed native, 14 manual), every card already non-native
>   (19 arbiter-spell, 6 body-only, 1 playable-pw). 14,885 → 14,859 descriptors, **0 gained, 0 re-scoped**; the 642 quoted
>   abilities in the corpus run through the GroupGranted and Emblem probe shapes: 0 changed.
> · **The fix** (`triggers.js`). ① `SELF_THIS_RE`: "this [something]" is a self-reference only when [something] is a quality
>   of the object (CR 700.7) — a closed noun list (every noun that followed "this" in a corpus condition: creature, artifact,
>   enchantment, land, battle, permanent, card, spell, token, aura, equipment, vehicle, class, case, door, siege, spacecraft,
>   contraption, plane, phenome-nom, boss, attraction; plus planeswalker, saga, room, fortification). The non-self four ("this
>   turn", "this way", "this mana", "this combat") are absent by design. ② The noun-less re-worded self form, "this" as the
>   subject of an event verb at the condition's start — The Sprinkler of Stardust's quoted "Whenever this deals combat damage
>   to an opponent" (the first draft dropped it; the quoted-ability probe caught it). ③ A trailing "this turn" on a condition
>   that names no self is a DELAYED trigger's stated duration (CR 603.7, 603.7b) and is refused before every arm: without it,
>   three conditions fell through to plain event scopes — Death Frenzy dies/eachCreature, Beck // Call etb/eachCreature, First
>   Day of Class etb/creatureYouControl — standing triggers on a card that only creates one for a turn (on a permanent printing
>   that shape in an ability, a trigger all game). An ORDINAL count bounded by "this turn" ("you cast your second spell this
>   turn", "an opponent draws their second card this turn") is excepted: there "this turn" bounds the count, and the four
>   cast/draw ordinal arms read it as "each turn" (the first suite run caught it — trigCast2 / trigDraw2 went red; zero corpus
>   carriers either way). The name / short-name / first-word self-refs are untouched.
>   effects/parseHelpers.js and effects/castModifiers.js do not share the shortcut: castModifiers' `selfRef` is a per-cost regex
>   for the paid object ("sacrificed", "discarded"), parseHelpers' mention is a comment; no `\bthis\b` matcher is left in the engine.
> · **The 26, and what each does now** — every one detects NO trigger for that condition (each now classifies null → the
>   sentence stays unmodeled; no card was credited before or after):
>   permanents — **Maeve, Insidious Singer** (was attacks/self, native: drew on Maeve's own attack), **Whirlwind, Killer Cyclone**
>   (attacks/self, manual), **Shelob, Child of Ungoliant** (dies/self, manual), **Whippoorwill** (dies/self, manual), **Pharika's
>   Spawn** ("when it enters this way": etb/self, manual, on every entry), **Pick Up the Pace** (attacks/self on an enchantment,
>   native — fired only if animated), **Jaya, Fiery Negotiator** (the −2's "whenever you attack this turn": attacks/self on a
>   planeswalker, manual); instants and sorceries (never on the battlefield, so their descriptors never fired) — Ondu Rising,
>   Song of Blood, Indulge // Excess, Touch of the Horned God, Descend on the Prey, Consuming Rage (attacks/self); Gnawing
>   Crescendo, Death Frenzy, Skeletonize, Fight for the Throne, Reckless Blaze, Graceful Reprieve, Turn Inside Out, Devouring
>   Tendrils, Ghired's Belligerence, Desperate Measures (dies/self); Beck // Call, First Day of Class, Theoretical Duplication
>   (etb/self).
> · **⚑ Games can change** for a seat with Maeve (no draw on her attack), Whirlwind / Shelob / Whippoorwill / Pharika's Spawn
>   (no manual trigger on their own attack, death or entry), and Pharika's Spawn in the AI's blink pick (`gameEngine` scores a
>   permanent with an etb/self descriptor +3 for Brago-style blinks; it had one only through the misread). None of the 26 is in
>   any profile deck (the three profiles' decks.local.json searched), so seeded profile-deck games are unaffected.
> · Witness `nonSelfThisCondition.test.js` (15; 8 red at 86389b97, on assertions): Maeve's detection and a Maeve attack that
>   draws nothing; Whirlwind attacking, Shelob dying, Pharika's Spawn entering — each fires nothing; all 26 real cards detect
>   nothing and none is native; the three window cards refused; a probe permanent printing a "this turn" window in an ability
>   does not fire when another creature enters. Controls: Library Larcenist ("this creature") and Svyelun (first-word name)
>   each draw on attack, Boomerang, Blade Flinger (short name) drains 1, Sengir Vampire's "by this creature this turn" watcher,
>   Choking Tethers' "this card" and Artisan of Kozilek's "this spell", The Sprinkler of Stardust's noun-less quoted grant,
>   the three ordinal "this turn" counts.
> · Mutants (witness file + trigCast2 + trigDraw2): selfRef back to `/\bthis\b/` (8 red) · the window refusal removed (3) ·
>   the ordinal exception removed (3) · the noun-less subject form removed (1) · "creature" dropped from the noun list (2).
> · ⚠️ Found, not fixed: the delayed "whenever … this turn" trigger a spell creates is not modeled (19 arbiter-spells above);
>   Pharika's Spawn's escape-only ETB and Maeve's goad-rider draw need a "this way" / goaded-creature watcher; the
>   for-the-first-time latch gate in `detectTriggers` (`ownWindow`) still tests `^(?:this|you)\b` — harmless today (no condition
>   starts "this turn"; it can only add a latch), noted for the next pass.

> ## 🎭 2026-10-16 — FIX: one Role per player per permanent (CR 704.5y) — Doubling Season no longer leaves two Roles on one creature · **±0** · corpus unchanged
> Suite **19,441** green (1 skipped) / 1,808 files. Lint 0 (CR citations: 0 of 10,379 name no rule). Flip-diff **0 / 0 / 0**
> (34,620 cards; before = 86389b97's code, after = this commit's). **Mutants 6/6** on assertions, restore byte-identical.
> · **The bug.** `sba.js` had no CR 704.5y arm. A token doubler (Doubling Season, Parallel Lives, Anointed Procession) doubled a
>   Role creation and `tokens.applyCreateNamedToken` attaches every minted copy to the one target: two Roles on one creature,
>   both granting. A second Role from the same player stacked instead of replacing the first (Splashy Spellcaster once per
>   instant or sorcery, Giant Inheritance once per attack, a second Charmed Clothier / Redtooth Genealogist, Eriette's Whisper,
>   Shatter the Oath). The 10-16 Aura work guarded only the non-cast host choice (`auraEntry.auraEntryHosts`).
> · **The fix.** `sweepRoleUniqueness`, an arm of the CR 704.3 fixpoint after 704.5r: Roles are grouped per (host, Role
>   controller); of each group only the most recent stays and the rest go to their owners' graveyards through `moveCardToZone`
>   (the token vanishes, CR 111.7; the host's link is torn down; the leave event is drained at the end of the sweep, so the
>   Wicked Role's "When this Aura is put into a graveyard from the battlefield, each opponent loses 1 life" fires). **The
>   timestamp:** Role tokens carry no `timestamp` field (no token mint in `tokens.js` stamps one), but an Aura's newest
>   timestamp is its latest attachment (CR 613.7e) and `gameState.attachPermanent` — where every attachment is formed — moves
>   the id to the end of the host's `attachments`, so the newest Role is the last of its controller's in that list. A doubled
>   creation's two copies take creation order (CR 613.7m leaves it to their controller; they are identical). A Role counts only
>   while both links hold. Logged `role-replaced` ({ cardName, controller, hostName, keptName, cause: "sba" }). "A Role" is one
>   reading now, `auraEntry.isRoleCard` (the entry choice, the token copy and the check). The quiescent scan reads only attached
>   permanents' type lines and looks nothing up.
> · **⚑ Results:** games change only where a player's second Role reaches a permanent already carrying one of theirs — the 17
>   native Role creators (Charmed Clothier, Charming Scoundrel, Cut In, Embereth Veteran, Eriette's Whisper, Giant Inheritance,
>   Living Lectern, Protective Parents, Redtooth Genealogist, Shatter the Oath, Spiteful Hexmage, Splashy Spellcaster, The
>   Witch's Vanity, Twisted Fealty, and the Adventures of Besotted Knight, Conceited Witch, Ferocious Werefox), with a token
>   doubler or a repeat creation. No deck in the three profiles carries one (they carry doublers only: Doubling Season in Atraxa
>   Superfriends, Earth Bent and Hulk Smash; Flash Photography in Kinnan), and the arm returns the state it was given when no
>   permanent carries two Roles of one player, so bench games are byte-identical by construction. No epoch notice needed.
> · Witness `roleUniqueness.test.js` (10; 6 red at 86389b97, all on assertions): Eriette's Whisper cast for real under Doubling
>   Season — two Wicked Roles made, one stays (Bears 3/3, not 4/4), the newer one, the older in no zone at all, and its drain
>   costs the opponent 1 life; Cursed then Monster (Cursed goes: Craw Wurm 7/5 trample) and Monster then Cursed (Monster goes:
>   1/1, no trample); grouped per player (your Cursed goes, the opponent's Wicked between your two stays). Guards (green
>   before and after): Roles of two players both stay; your Rancor beside your Monster Role stays; a single Role and one Role on
>   each of two creatures return the very same state.
> · Mutants: the arm removed (6 red) · the oldest kept (3) · one group for every controller (2) · every attachment counted as
>   a Role (1) · the replaced Role exiled instead (1 — the Wicked drain) · `isRoleCard` false (9, the token-copy guard included).
> · Suite note: the first full run (before the lookup-free rewrite) had one timeout — `crucibleRun.test.js` "plays EXACTLY N
>   games" at 20,376 ms against the 20,000 ms limit under load; alone it runs ~12 s, and an A/B with and without the arm stayed
>   inside the run-to-run noise (±0.8 s). The final run above is green.
> · ⚠️ Found, not fixed: (1) `auraEntry.auraEntryHosts` still never lets a Role choose a permanent already carrying a Role of
>   its controller — now narrower than CR 303.4f (a person can't pick it; a doubled token copy with one free creature makes one
>   token where the rules make two and discard one, so its enters/leaves triggers — a Wicked drain — are missed). (2) A Role that
>   phases in alone is re-appended to its host's `attachments` (`phaseInAndExpireShield`), so it reads as the newest though
>   phasing gives no new timestamp — wrong only if the same player attached another Role to that host while it was phased out.
>   (3) Tokens minted in `tokens.js` carry no `timestamp`, so their statics sort at 0 in the layer timestamp order whenever they
>   entered.

> ## 🔧 2026-10-16 — FIX: the explicit tap-for-mana pays the printed cost and honours the condition (Ashnod's Altar, Mox Opal, Birchlore Rangers, Mana Confluence, the painlands) · **±0** · corpus 15,494
> Suite **19,462** green (1 skipped) / 1,808 files. Lint 0 (CR citations: 0 of 10,368 name no rule). Flip-diff **0 / 0 / 0**
> (34,620 cards; before = 86389b97's code, after = this tree), so every coverage count is unchanged. **Mutants 19/19** on
> assertions, restore byte-identical (sha256 of the three engine files compared after each).
> · **The bug** (reported 2026-10-16, re-proved on 86389b97 through `legalActionsForPlayer` + `dispatchAction`). The action a
>   person takes on the Learn board (`legalChoices.actionsTapForMana` → `actionDispatcher.applyTapForMana` →
>   `manaModel.commitManaTap`) rebuilt each permanent's production from `manaProduction` and carried only `sacrifices` and the
>   activation cost; the dispatcher committed the action object itself. Every other flag `manaSources` resolves for the planner
>   was ignored: Ashnod's Altar made {C}{C} alone, and beside a creature sacrificed none and tapped itself; Mox Opal tapped
>   without metalcraft (`activationCondition`); Birchlore Rangers and Springleaf Drum tapped no payer (`extraTap`); Mana
>   Confluence and the Horizon lands paid no life (`payLife`); Adarkar Wastes, Grand Coliseum and the Odyssey threshold lands
>   (Cabal Pit, Cephalid Coliseum, Barbarian Ring…) dealt no damage (`painColors`); Molt Tender exiled nothing and was offered on an empty graveyard (`exilesGyCard`); Endrider
>   Catalyzer made {R}{R} at speed 0 (`requiresMaxSpeed`); Plaza of Heroes and Incubation Druid made all five colours on any
>   board (`colorsAmongSpec`); an Elvish Spirit Guide on the battlefield tapped for {G} (`fromHand`); Mishra's Workshop, Ancient
>   Ziggurat and Untaidake floated restricted mana into the open pool (`restriction`, CR 106.6). A hand-built action that left
>   its riders out got the mana free.
> · **The fix — one source, one tap record.** `manaModel.manualManaTaps(state, player)` is the explicit tap's only source: it
>   reads `manaSources` (so every gate is the planner's, at its one chokepoint) and returns, per (source, colour), the record
>   `tapRecordFor` builds — the builder planPaymentCore's `tapSource` now calls too (byte-identical tap records; the parity
>   witness compares the two). The offer pushes those records; the dispatcher re-derives the one taken by permanent and colour
>   and commits it, refusing (`MANA_TAP_UNAVAILABLE`) a colour the permanent can't make now or a cost it can't pay (CR 601.2h —
>   partial payments are not allowed; CR 602.5 for the condition). By hand it skips hand cards and no-{T} counter sources (as
>   before), spend-restricted mana and "when that mana is spent" riders (floating mana keeps neither — Path of Ancestry is no
>   longer offered by hand), a permanent's EXTRA lines (the action names only a colour, so Crystal Vein's sacrifice line would
>   look like its free {C}), and 0-mana taps. Reading the record also corrects what the explicit tap MADE: doubled under Mana
>   Reflection, Urborg / Yavimaya colours, a chosen colour, Chrome Mox's imprint, a copy's mana (Thespian's Stage), Birchlore
>   Rangers usable the turn it lands. Five hand-built Treasure taps in three tests named {C}, a colour a Treasure can't make;
>   they now name {G}. ENGINE-SCAFFOLD §4.7 carries the seam.
> · **AI in self-play.** The default AI takes `tap-for-mana` at exactly one site: `manaUntapLine.manaUntapLineAction` (line 133,
>   via `opponentAI.pickAction`), which floats the lands Candelabra of Tawnos / Magus of the Candelabra will untap, taking the
>   FIRST tap offered for each planned land (a land worth ≥2 by `manaValueOf`). Every other pick filters by kind; the discover /
>   cascade / free-cast `actions[0]` fallbacks run in windows that offer no tap. Probe over all 1,187 corpus lands (base vs this
>   tree, the first tap offered): 28 change, 2 of them plannable (worth ≥2) — Untaidake, the Cloud Keeper and Mishra's
>   Workshop, both restricted, now not offered (the line returns null and the AI moves on). Only the cdh profile deck holds the
>   Candelabras, and it holds neither land (its ≥2 lands, Gaea's Cradle and Ancient Tomb, offer the same first tap), so no bench
>   game should move; no seeded batch was run. An external pilot (omnath-tools) choosing among offered actions sees the
>   corrected set.
> · Witness `explicitTapCost.test.js` (31; 28 red at 86389b97, every one an AssertionError): the offer gate per card (Altar, Mox
>   Opal, Rangers, Confluence at 1 life, Drum, Molt Tender, Endrider, Spirit Guide, Plaza, Incubation Druid, Workshop, Path), the
>   payment per card (Altar's victim, Rangers' Elves, Confluence and Canopy life, Adarkar's {W}/{U} and free {C}, Drum's
>   creature, Molt Tender's exile), three hand-built actions (Confluence still pays; Mox Opal and a lone Altar refused), the
>   planner parity (six sources incl. Mana Reflection), and three guards (a Spirit Guide in hand, Starting Town's extra line,
>   Gaea's Cradle at 0).
> · Mutants (19): the old actionsTapForMana · the old applyTapForMana · the hand-card skip · the no-{T} counter skip · the
>   restriction skip · the spent-rider skip · the extra-line skip · the 0-mana skip · painLife · payLifeCost · extraTaps ·
>   sacrificesCreature · exilesGyCard (each out of tapRecordFor) · committing the action instead of the re-derived tap · the
>   refusal (falling back to the action) · the offer's pool check for an activation cost · the dispatcher's activation charge ·
>   Mana Flare's same-colour bonus · the fixed bundle offered once.
> · ⚠️ Found, not fixed (both paths — the planner too):
>   ① A no-{T} source is TAPPED by the commit (`commitManaTap` taps unless `sacrifices` / `noTap`): Ashnod's and Phyrexian Altar
>   end tapped after one use and fire "tapped for mana" watchers (CR 106.12 needs a {T} in the cost); Birchlore Rangers is
>   tapped on top of two OTHER Elves when the payer sort picks them (three tapped); Kozilek's Translator's "Activate only once
>   each turn" is dropped by `manaProduction` and only that accidental tap enforces it (and it taps a creature that could attack
>   or block). Needs a once-per-turn ledger for mana lines first; changes AI play.
>   ② `globalTapManaAugment` credits a no-{T} source: Kinnan, Bonder Prodigy adds {C} to Ashnod's Altar's {C}{C} (probed) and to
>   an Eldrazi Spawn's sacrifice — neither is tapped for mana. Phantom mana.
>   ③ Ancient Tomb's "This land deals 2 damage to you" is dropped (a free {C}{C}, probed: life unchanged); Mox Amber's "among
>   legendary creatures and planeswalkers" reads as any colour; Path of Ancestry's "in your commander's color identity" reads as
>   any of five; Hall of the Bandit Lord's haste and Boseiju, Who Shelters All's can't-be-countered "if that mana is spent"
>   riders are dropped (only Path of Ancestry's scry is a `spentRider`).
>   ④ The mana-untap line values a land by its best record (`manaValueOf`) but taps its first offered action — for a storage land
>   the plan counts the counters and the tap makes {C}.
>   ⑤ UI: LearnBoard's colour picker shows only `o.color`, so a costed tap (a painland's {W}, Mana Confluence) shows no cost;
>   extra lines stay planner-only until the label can show one. The payers and the Altar's victim are the house pick, never the
>   person's.

> ## 🔧 2026-10-16 — FIX: a quoted grant is never a land's own mana line (Forgotten Monument, Riftstone Portal, Command Power Plant) · **−3** (FPs removed) · corpus 15,467
> Suite **19,444** green (1 skipped; 1,808 files). Lint 0 (CR citations: 0 of 10,366 name no rule). Flip-diff **0 / 3 / 0** over
> 34,620 cards (before = 86389b97's code, snapshotted before the first edit), every LOST card named below against the runtime
> reader of its grant. measure-coverage 15,470 → 15,467 (44.7%); play-weighted unchanged (top 1,000 896, top 2,500 1,735; none of
> the three is ranked above #11,678); decks 2,738 / 2,998 unchanged. **Mutants 4/4** on assertions, restore byte-identical.
> Classification only: the diff is coverage.js (`classifyCard` has no runtime consumer) plus one test file.
> · **The hole** (filed by the native-mana static-residue slice, found there by ablation). `landFullyCovered`'s `isManaLine`
>   read each line with `manaProduction`, which keeps a land's raw oracle (the reminder-text duals) and so never runs
>   `stripNonSelfQuotedGrants` on a land: a quoted "{T}: Add …" inside a grant read as the land's own production, and the
>   grant line passed as a mana line. The activated leg (`a.modeled || … || isManaLine(a.raw)`) shares the read, so an
>   unmodeled activated ability whose effect grants mana ('gains "{T}: Add …"') was rescued the same way (synthetic witness;
>   no real land carries it).
> · **The fix.** A line that quotes an ability is never a mana line: an ability an effect says an object "has" or "gains" is
>   that object's (CR 113.10), not the granter's own mana ability (CR 605.1a). The whole line is refused, not the quote cut
>   out of it; the cut form lets a grant welded onto a real mana line ride on that line's production (mutant M2). Not the
>   nonland guard's "<cost>: Add" shape, which the chip warned cannot be copied (Nykthos and four more begin "Choose a color.
>   Add …"): the quote rule leaves them alone (0 gained, 0 retiered).
> · **LOST (3), each against the runtime reader of its grant** (`parseStaticAbilities` emits no mana grant for any of the
>   three, so `grantedManaSpecsFor` never delivers one; each card's own mana line still plays): **Forgotten Monument**
>   ("Other Caves you control have …") — beside it a Cave with no mana ability is no source and Hidden Courtyard taps only
>   {W}; **Riftstone Portal** ("As long as this card is in your graveyard, lands you control have …") — with it in the
>   graveyard a land with no mana ability is no source and an Island taps only {U}; **Command Power Plant** ("Command Towers
>   you control have, …") — beside it and a Command Mine, a Command Tower's record equals the Tower's alone (one mana).
> · **Kept:** 22 cards with a Land type line and a quote were native before; the other 19 are unchanged — reminder quotes
>   stripped before the read (the ten Investigate rooms, Junktown, Gingerbread Cabin, Hall of Tagsin, Dryad Arbor, Gobland),
>   Dragon-Cursed Halls (a granted trigger, no mana), Spawning Bed (its Scions' "Sacrifice this token: Add {C}." is part of its
>   own modeled token ability, vouched by the activated lane), Malakir Rebirth (the quote is on the spell face), and **Urza's
>   Saga**, the one land whose quoted mana grant the runtime does apply — the Saga gate decides it, not this read.
> · **No exception lane:** 0 of the 63 cards with a Land type line and a quote carry a mana grant the static parser emits (a
>   layer-6 mana addAbility), so no land keeps credit through a grant. A synthetic land with Cryptolith Rite's grant (which
>   the runtime would apply) now parks too: a false negative with no carrier.
> · Witness `landQuotedGrantMana.test.js` (13; 3 red at 86389b97, each an AssertionError — the named three, the welded grant,
>   the gains grant): the named lands beside their grant-less twins; the empty static reads beside Cryptolith Rite's one; the
>   three boards above, Cryptolith Rite's bear the positive control; Spawning Bed, Command Tower and Urza's Saga kept, the
>   Saga's exactly-{C} driven through the land drop and chapter I. The 10 runtime and control cases pass at 86389b97 too.
> · Mutants (4): the quote gate dropped (3 red) · the quote cut out instead of the line refused (1) · the gate on the residue
>   loop only (2) · on the activated leg only (1).
> · ⚠️ Found, not fixed: seven lands are credited `land` while their mana line ends in a conditional "instead" sentence the
>   per-line read never checks. Six read as their base (the documented under-read): Urza's Tower, Urza's Mine, Urza's Power
>   Plant, Command Mine (one mana, never the upgrade), River of Tears ({U} even after a land drop), Gemstone Caverns (its
>   upgrade unreachable, no luck counter is ever placed). **A-Town** is the other way: `manaProduction` reads its "instead add
>   one mana of any color" and the land taps for any color unconditionally (an Un-card; a runtime over-read). Crediting a
>   land's modeled group mana grant would need a static lane in `landFullyCovered` (zero carriers today).

> ## 🧭 2026-10-16 — FIX: the AI's Aura cast picks a side for every host, not only creatures (Fraying Sanity on itself, Petrify on its own Mind Stone) · **±0** · corpus 15,494
> Suite **19,157** green (1 skipped) / 1,794 files. Lint 0 (CR citations: 0 of 10,146 name no rule). Flip-diff **0 / 0 / 0**
> (34,612 cards; before = 9e06e246's code), so every coverage count is unchanged. **Mutants 7/7**, restore byte-identical.
> 48 July-list games: 47 byte-identical to batch 4 (9e06e246); one moves — seed 4185404953, where Mothman Cometh (seat user) puts Fraying
> Sanity on ai2, the opponent with the fewest cards in library, instead of ai1, the first by id; same winner (ai3, combat), 35 turns
> for 34. Hashes `a1a9f98e68c3b6c3` (8, unchanged) / `884ee6c669637325` (40).
> · **The bug** (reported 2026-10-16, re-proved through the real `pickAction`). `opponentAI.pickAuraCast` sent every Aura whose
>   offered targets were not of type "creature" to the land mana Aura rule (`manaUntapLine.pickManaAuraTarget`: the land
>   carrying the most mana Auras, else the first target by id). That rule is right only where the offer is the caster's own
>   lands; anywhere else the first id was the AI's own. Fraying Sanity ("Enchant player", offered every player) enchanted the
>   AI itself whenever the caster's seat sorts first among the players offered — "ai" in a two-player game, "ai1" in a pod
>   (from the "user" seat, which sorts last, it found an opponent by luck). An Enchant line wider than creature — "artifact
>   or creature", "nonland permanent", "creature or Vehicle", and "creature or planeswalker" with no creature out —
>   enumerates its hosts as type "permanent" / "planeswalker" (`spellEffects.enumerateTargets`), so Petrify and Suppression
>   Bonds locked the AI's own Mind Stone or Grizzly Bears and Nahiri's Binding its own planeswalker. Animate Dead
>   (graveyard-card targets) reanimated the lowest id.
> · **The fix, by what the Aura enchants.** The caster's own lands — the mana-boost lane (`isNativeManaAura`) and the
>   granted-ability lane whose host is a land (`grantAuraCastHostType`: Squirrel Nest, Gift of Paradise, 30 cards) — keep
>   `pickManaAuraTarget` exactly as c1122e34 left it, now also filtered to own lands. A card in a graveyard (Animate Dead): the
>   biggest printed power in either graveyard (it returns under the caster's control either way), then id. A player: the new
>   curse reading, `playerAuraEffect.js` — each trigger read as the runtime fires it (`detectTriggers`, then
>   `parseEffectClause(clause, "Instant", { hasX, sourceScoped })`), every atom looked up in `ENCHANTED_PLAYER_EFFECTS` (what
>   the op does to the enchanted player: a side and a ranking). Only Fraying Sanity's `enchanted-gy-mill` is there (enemy; the
>   opponent with the fewest cards in library first, CR 704.5b); any other op, or a LOW or modal trigger → null → hold. Only
>   Fraying Sanity of the snapshot's 46 player Auras is native. A permanent ("creature", "permanent", "planeswalker"):
>   `auraEntry.auraCastIntent`'s side, then power as the layers read it (an uncrewed Vehicle counts its printed power), then
>   id. Petrify, Suppression Bonds, Stasis Cocoon, Secure Detention and Planar Disruption read as curses through the
>   restriction grants d70f5763 added to that reader.
> · **⚑ Results (flag to Omnath):** AI choices change for a seat that casts one of these Auras. Probe — every Aura in the
>   bundled snapshot through `legalActionsForPlayer` + `pickAction` on mirrored two-seat boards (with creatures; with
>   planeswalkers and a Vehicle; with no creature): 10 / 11 / 12 picks flip of 560 / 560 / 49 offered, every one off the AI's
>   own side — onto an opponent's (Fraying Sanity, Petrify, Suppression Bonds, Stasis Cocoon, Secure Detention, Planar
>   Disruption, Aether Meltdown, Mists of Littjara, Nahiri's Binding) or to a hold (Ice Over, Coma Veil) — plus Relic Ward
>   choosing its own Smuggler's Copter over its own Mind Stone. The land lanes are unchanged. On the benches only **Mothman
>   Cometh** (Fraying Sanity; July list and shelf) and **Teval, the Balanced Scale Test** (Animate Dead; shelf) carry one.
> · Witness `auraCastSide.test.js` (13; 10 red at 9e06e246): Fraying Sanity on the opponent, held when only the AI is
>   targetable (Leyline of Sanctity), on the fewest-library opponent in a pod; Petrify on the opponent's biggest artifact or
>   creature and held with only its own; Suppression Bonds on the opponent's Sol Ring; Relic Ward on its own artifact, held
>   with only the opponent's; Aether Meltdown on the opponent's biggest creature; Ice Over held; Animate Dead from either
>   graveyard; Wild Growth and Squirrel Nest unchanged; the curse reading itself (Fraying Sanity enemy; Curse of Opulence and
>   Paradox Haze, which the engine does not read, null).
> · Mutants: the old routing (8 red) · the curse side flipped (4) · the restriction reading removed from auraCastIntent (3) ·
>   reanimation smallest first (1) · the pod ranking reversed (1) · the Fraying Sanity entry deleted (3) · the permanent side
>   ignored (4).
> · ⚠️ Found, not fixed: "doesn't untap during its controller's untap step" (Ice Over, Coma Veil; Claustrophobia on a creature)
>   has no side reading — `auraCastIntent` reads null and the AI holds them (FN-safe). Each newly modeled player-Aura op needs an
>   `ENCHANTED_PLAYER_EFFECTS` entry before the AI casts it; a non-cast Curse entry should import this reading, not write a
>   second (routed to "Lift the remaining Aura withholdings").

> ## 🔧 2026-10-16 — FIX: a fight, a bite and a self-fight deal ORDINARY damage — the four direct marks go through the spell deal path · **+0** · corpus 15,492
> Suite **19,026** green on the rebased tree (4463487c + this; 1,780 files, 1 skipped; this slice +50); lint 0; corpus 15,492 / 34,620 unchanged (top 1,000 904, top 2,500 1,743). Flip-diff **0 / 0 / 0** over 34,620 cards (HEAD's engine → the slice). **Mutants 25/25** on assertions, restore byte-identical.
> Seeded games: 24 commander games on the 30 profile decks (43,509 decision rows) — **23 byte-identical**; the 24th is a fight (below).
> · **The gap** (banked 2026-09-30 at census rank 46, Crystal Barricade / Tajic; stage ③ · 18's "a fight recording no damage
>   source is the one left"). `effects/atoms/combat.js` marked the damage of four atoms straight onto the creature with
>   `gameState.markCombatDamage` — `fightCreature` (the source-bound fight: Kogla, the Titan Ape's ETB), `applyFightPair` (Prey
>   Upon), `applyDamageTargetPower` (Rabid Bite, Ram Through) and `applyDamageSelfPower` (Justice Strike) — skipping every step
>   `applyDamageEffect` takes. Each consequence was cast for real on the old code before the fix, and every one reproduced:
>   Dawn Elemental died to all four paths; Child of Night gained nothing; Glistener Elf marked 1 damage instead of a -1/-1
>   counter; Sengir Vampire got no counter and Kumano's Pupils' victim went to the graveyard (no damage source recorded);
>   Ripjaw Raptor's enrage and Zebra Unicorn's dealt-by link never fired; Furnace of Rath did not double; a Samite Healer
>   shield was not consumed; White Knight's protection from black did not stop Sengir.
> · **The fix — one deal path, extracted, not copied.** `spellEffects.js`: applyDamageEffect's creature hit and player hit are
>   now `dealDamageToCreature` / `dealDamageToPlayer`, its source read `damageDealer`, its record `beginDamageEvent`, its
>   settlement `settleDamageEvent` (enrage, dealt-by, lifelink); applyDamageEffect calls them and is unchanged (218
>   damage-touching test files, 3,645 tests, green before the fights were touched). New `dealSimultaneousDamage(state, hits)`:
>   ONE event — every dealer read before any hit, every hit dealt before the single lethal pass — each creature the source of
>   its own damage with its keywords read (`readsKeywords`, the Warstorm Surge lane's flag). The four atoms lock their amounts
>   (CR 608.2h) and call it. Not combat damage (CR 701.14d). ENGINE-SCAFFOLD §6 carries the rule: a new "deals damage" atom
>   deals through one of the two funnels; `markCombatDamage` is the last step, never a substitute.
> · **Fixed with it — each a consequence of the routing:**
>   ① The Last Agni Kai's mana is the excess DEALT (CR 120.10): the old excess came from the locked power, so once Dawn
>   Elemental's wall applied it would have minted {R}{R}{R} for damage never dealt.
>   ② The lethal pass destroys for deathtouch damage DEALT, not marked (CR 704.5h): `destroyLethalCreatures` asked
>   `deathtouched && damageMarked > 0`, so deathtouch dealt as -1/-1 counters killed nothing. Every producer of the set adds
>   only dealt damage (combatResolution's addDmg, the shared hit), so the marked-damage proxy is gone. 0 printed cards carry
>   deathtouch with infect or wither (corpus, 38,697); 191 grant deathtouch. **⚑ Combat changes too** for a granted pair:
>   Glistener Elf wearing Basilisk Collar now kills its blocker.
>   ③ Ram Through's trample excess is dealt by the biting creature in the same event (it was dealt by the spell, a second
>   event): Blightsteel Colossus's 9 is poison, and a lifelinker gains its whole total once.
>   ④ **A bite at a planeswalker resolved as NOTHING** (hollow native, pre-existing): `fightPairRefs` kept only creature
>   targets, and the enumerator tags the walker `planeswalker` — Bite Down, Hard-Hitting Question, Horrific Assault, Master's
>   Rebuke (and split faces) never touched loyalty; their test parsed the clause and never cast one. The dealee may now be a
>   role-tagged planeswalker; the bite's source is the creature (lifelink, a doubler scoped to it).
>   ⑤ Deathtouch counts only damage dealt: the old fights put the dealee in the deathtouch set before any damage, so with
>   the prevention walls now applying, a prevented deathtouch hit would still have killed — witnessed the right way round
>   (Vampire Nighthawk's prevented 2 leaves Dawn Elemental alive and gains nothing).
> · **Citations:** fight is CR 701.14 in the bundled CR — 701.12 is Exchange. The rewritten docblocks cite 701.14a/b/d,
>   120.2b, 120.10, 704.5h, 608.2h; a moved comment's 702.16b (targeting) for Teferi's Protection's damage is 702.16e.
>   ⚠️ 29 other "CR 701.12" fight citations remain in 8 files (combat.js, parser.js, targeting.js, tribute.js and four tests)
>   — a real rule number, the wrong rule, so a does-it-exist check passes them. Left for the citation sweep.
> · Witness `fightDamagePipeline.test.js` (50), every case cast through legalActionsForPlayer → dispatchAction → resolve
>   (the combat case through resolveCombatDamage), real fixtures, each witness beside a control that differs in one card.
>   Seen to fail: 29 of 50 red on HEAD's engine, every one an AssertionError at the witnessing line. Mutants (25): the four
>   routings reverted one at a time, the planeswalker source and dealee, Ram Through's excess dealer, Agni Kai's excess, the
>   fighter's card (Wolverine), two simultaneity breaks (sequential events; the second power re-read after the first hit),
>   thirteen steps of the shared path (the doubler's source among them), and the lethal-pass guard.
> · ⚑ **Results change (flag to Omnath):** any game with a fight, a bite or a self-fight whose creatures carry a wall, a
>   shield, lifelink, infect, wither, deathtouch, protection, an enrage or a dealt-by trigger, a doubler, or a dealt-by watcher.
>   Measured: the 24-game batch (base seed 20261016) changed ONE game — seed 942741375, Wolverine / Zaxara / Atraxa / Believe
>   it! — where Wolverine, Best There Is fights Walking Ballista through Ancient Animus: the fight now counts as Wolverine
>   dealing damage to another creature, so its end-step +1/+1 counter lands (HEAD's direct mark skipped the arm); same winner
>   and turn count, 1,220 → 1,226 decision rows, first divergence at that end step. Five other games resolved a fight or a
>   bite and stayed byte-identical (no wall, shield, keyword or watcher in them). That game is now a witness (Wolverine vs
>   Wall of Stone: its own doubler makes the fight deal 4; the counter lands) — the doubler scoped to the fighter was the one
>   step Furnace of Rath could not see.
> · ⚠️ Found, not fixed (queued): Chandra's Ignition (`source-power-fanout`) still deals through applyDamageEffect without
>   `readsKeywords` — the chosen creature deals the damage, but its lifelink and deathtouch are not read (one flag at its
>   call site, witness first); `fightCreature` does not check CR 701.14b's "no longer a creature" for a source-bound
>   fighter; the combat funnel gains lifelink per player, where CR 119.9 counts a life-gain event per source. Crystal Barricade / Tajic
>   (census rank 46) is unblocked: a group noncombat wall is now one check in `dealDamageToCreature`.

> ## 🔧 2026-10-16 — FIX: a double-faced card makes the mana of the FACE THAT IS UP — 88 phantom sources (Storm the Vault, a reanimated Drowner of Truth, Tamiyo) · **−1** (an FP removed)
> Suite **18,999** green (1 skipped; 1,781 files). Flip-diff **0 / 1 / 0** over 34,620 cards — the one LOST is an FP removal
> (below). Runtime fingerprint: exactly **88** `manaProduction` reads change, every one to null, mana field only, none gained.
> **Mutants 6/6**, restore byte-identical. Lint 0; CR citations 117 unresolved (the baseline; this slice's two, 712.8d and
> 712.14, resolve). Built on 4463487c, rebased onto 7f46eff1 (the layer derive's face-up read); every gate re-run there.
> · **The bug** (found 10-16 in the Lion's Eye Diamond audit). `manaProductionImpl` decided land-ness on the COMBINED type
>   line and parsed both faces' text as one card. A back face's Land made the front a land — raw oracle, reminder text and
>   created-token quotes kept — and a back face's mana ability read as the front's. The engine never turns a back face up,
>   so a transform card cast from hand and a modal one put onto the battlefield by an effect sit there as the whole card.
> · **Reachable, on the real paths:** Storm the Vault cast beside two artifacts offered {U}{U} and sacrificed itself (its
>   Treasure reminder + its back's "Add {U} for each artifact"); a Drowner of Truth that Reanimate puts onto the battlefield
>   paid {C} to sacrifice itself for {C} (its Spawn tokens' quoted ability; `manaActivationCost` read {C} out of "if {C} was
>   spent to cast it"); a reanimated Tamiyo, Inquisitive Student was an any-colour source with no {T}, sick or not (her back
>   face's −3); Golden Guardian tapped for two of any one colour. Drowner's face cast is never offered (land-partial), so
>   reanimation is its only road to the battlefield — as the combined card (CR 712.14).
> · **The fix.** `manaModel.faceUpManaCard` projects a combined card onto its front face — `layers.faceUpTypeLine` (7f46eff1's
>   export, the derive's own read) for the type line, the first face block of the bundled oracle, header peeled, for the text —
>   and `manaProduction`, `manaActivationCost` and `extraManaLineProducts` read that face (`frontFaceOracle`, the partial read
>   those two used, is gone). A one-line probe of a combined card (coverage's land-line reads) keeps its line. A modal face
>   played or cast is its own single-face card and unchanged: Drowned Jungle still makes G or U, a Pathway's back face its colour.
> · **Census** (bundled snapshot, 885 multi-face cards): 91 faces disagree on Land. 80 of the 82 land backs read a phantom, now
>   none (unchanged: Tangled Florahedron's front taps for its own {G}; Welcome to . . . read none already); the 9 land fronts
>   keep their own mana. 8 agreeing cards read a back face's (or an Adventure's) mana: Arlinn, the Pack's Hope; Brigid,
>   Clachan's Heart; Invasion of Zendikar; Keeper of the Crown; Life of Toshiro Umezawa; Tamiyo; The Legend of Kyoshi; Valki.
> · **The LOST card:** Invasion of Zendikar // Awakened Skyclave, native-mana → body-only — credited with Awakened Skyclave's
>   "{T}: Add one mana of any color"; the battle makes no mana. Snapshot native count 15,487 → 15,486.
> · `coverage.hasModeledVariableXMana`'s blanket "//" refusal stood in for this read ("manaProduction scans the COMBINED
>   oracle") and is removed: 0 tier changes across all 957 multi-face entries with and without it.
> · **The AI's land pick** read the hand card; with mana now the front face's, a spell // land drop would have lost its colour
>   (Sink into Stupor makes none). It reads the face the drop plays (`action.faceCard`) — which also judges each Pathway face
>   on its own (both read as the front before).
> · Witness `dfcFaceUpMana.test.js` (13) through the cast, Reanimate and land-drop paths and the AI's pick; one pins the
>   composition with 7f46eff1 (Storm the Vault under Urborg makes nothing — red without the derive fix).
> · Mutants: the face-up branch off · both faces' types kept (the back's Land decides) · both faces' text kept · the back
>   face's block read · a one-line probe losing its line · the land pick reading the hand card.
> · **⚑ Action sets change (Omnath's epoch call):** body-only transform permanents enter the battlefield, so their phantoms were
>   live — Growing Rites of Itlimoc tapped {G} per creature (Squirrel Girl, cdh), The Legend of Kyoshi X of any colour (Earth
>   Bent), Ojer Axonil / Ojer Kaslem like their temples (Nekusar, Veyran, Omnath); Brago Blink's Glasspool Mimic and Witch
>   Enchanter return from a blink as combined cards (`applyBlink` re-enters the exiled `printedCard`; probed: a blinked
>   face-cast Witch Enchanter tapped {W} at 7f46eff1, nothing now); the land pick moves MDFC decks.
> · ⚠️ Found, not fixed (relayed to the integrator; type reads, not mana text): `castsAsPlaneswalker` reads the combined line
>   when a card has no `card_faces` (game cards never do), so Tamiyo casts as an unmodeled planeswalker and never resolves;
>   manaSources' sickness choice and `layers.summoningSickNow` (a PAIR) test /Creature/ on the combined line — Hostile Hostel
>   can't tap the turn it is played; `keywords.hasKeyword` scans the combined oracle (a played Westvale Abbey is
>   indestructible, flying, lifelink, hasty); `globalTapManaAugment`'s subject and the sacrifice / tap-payer filters read the
>   combined line (Leyline of Abundance adds {G} off Cryptolith Fragment; Ashnod's Altar sacrifices a Westvale Abbey).

> ## 🔧 2026-10-16 — FIX: the native-mana gate reads a mana source's STATIC and REPLACEMENT text · **−41** · corpus 15,451
> Suite **19,005** green (1 skipped; 1,780 files). Flip-diff **0 / 41 / 0** (34,620 cards, base 4463487c), every LOST card
> audited by name against the runtime reader of its leftover sentence. **Mutants 12/13** on the final code (the 13th is a gate
> labelled belt-and-suspenders in the code), restore byte-identical. Lint 0. CR citations: 9,840 checked, 117 dead before and
> after, none new.
> · **The hole.** `manaCardResidueModeled` read a mana source's trigger sentences (FIX-MANA-OVERCLAIM) and its activated
>   abilities (2026-08-15) and nothing else, so a static or replacement sentence was never read: the card claimed native-mana
>   whatever it said. Witness (synthetic): Everflowing Chalice whose enters-with sentence ends "… and you lose the game." — the
>   per-kick strip refuses the rider (whole-sentence anchored), the sentence reached the gate, the gate never looked.
> · **The fix, no new parser.** The gate now ends with the COMPOSITE tier's own residue walk, lifted out of
>   `permanentFullyCovered` into two shared helpers (`stripModeledTriggerText` → `remainingClausesModeled`; the composite's
>   verdicts unchanged — 0 gained, 0 retiered): trigger text and activated lines go, every clause left must be
>   `clauseProducesStatic` or keyword-only. It reads classifyCard's etCard, so the enters-with / enters-tapped / crew / plot /
>   warp / cost-only strips and the whole-card pre-strips (self no-untap, no max hand size, suspend, the opening-hand line)
>   apply first.
> · **Credited before the loss was counted — sentences the runtime honours, each on the runtime's own reader; each credit's
>   rescues measured by ablation (20 = 8 + 4 + 2 + 1 + 5; with the 41 lost that is the first probe's 61):** a mana line with a
>   WORD cost, read by `manaProduction` per line and only in the "<cost>: Add …" shape with the colon outside quotes (Heritage
>   Druid, the Spirit Guides, Wall of Roots, Seton, Birchlore, The Cabbage Merchant, Lion's Eye Diamond); "As this <permanent>
>   enters, choose a color." on `choosesColorOnEnter`, admitted in the leg, not stripped upstream, because the chosen-color
>   mana parse needs its chooser (Coldsteel Heart, Sol Grail, Silhana, Quirion Elves); the counter doublers on
>   `stripModeledDoublerClauses` (Doc Samson, Kami of Whispered Hopes); the Glimmer "It's an enchantment." directive,
>   mirrored into the composite chain ANCHORED to the self-return clause (Enduring Vitality); the five Borderposts' unoffered
>   alternative cost, a printed-cost-gated pre-strip on the 2026-07-25 judgement (⚑ a judgement call — a vacuity credit, not
>   a runtime reader).
> · **Caught by the slice's own audit, before commit:** the first per-line mana read credited any line `manaProduction` could
>   read — including a whole sentence that only QUOTES "{T}: Add …" (Machine God's Effigy's copy clause, Great Divide Guide's
>   grant to lands and Allies). The flip-diff could not see it — both were native before and stayed native; the tell was two
>   names leaving the LOST list between iterations. Lesson: every card that LEAVES a LOST list mid-slice needs a reason.
> · **LOST (41), by what nothing reads:** replacements — Phial of Galadriel (conditional), Mox Diamond (enter), Susan Foreman
>   (planeswalk), Ichor Elixir (planar dice), Yawgmoth's Day Planner; enters-with shapes the reader refuses — Giada, Dragonstorm
>   Globe; grants with no descriptor — Chromatic Lantern, Great Divide Guide, Dalakos, Orochi Merge-Keeper; other statics with no
>   descriptor or reader — Heraldic Banner (chosen-color anthem), Altar of the Pantheon, Undercover Skrull, Stonework Packbeast,
>   Bender's Waterskin, The Lion-Turtle, Warden of the Wall, Freya Crescent, Crystal Skull, Intrepid Paleontologist, Daxiver,
>   Serum Powder; copies — Cursed Mirror, Machine God's Effigy; abilities the parser never detects — Devoted Druid, Honor-Worn
>   Shaku, Baylen, Page, Relic of Legends (a second mana line `manaProduction` can't read); an uncounted labelled trigger —
>   Phyrexian Atlas ("Corrupted —"); an unmodeled keyword — Topiary Lecturer (Increment); unreachable back faces — Invasion of
>   Zendikar, Sunbird Standard (Craft), Weaver of Blossoms (daybound); Un-/Alchemy text — The Sad Creaturez, Orb of Origin,
>   Andrios, Built Bear, Unique Charmed Pants, Gleemox.
> · **⚑ Chromatic Lantern** was PINNED native (manaTierPins.test.js, re-pinned with a note): board-measured, a Forest beside it
>   still taps only {G} — `parseStaticAbilities` emits nothing for "Lands you control have …" (Cryptolith Rite on the same
>   harness is the positive control). A play-weighted build target now, not a credit.
> · Witness `manaTierStaticResidue.test.js` (28): the synthetic witness beside its real control, one park per residue shape,
>   each credit beside its runtime proof (Sol Grail stamped through enterPermanent; Doc Samson/Kami through addCounter; Heritage
>   Druid through manaSources; the Borderpost cast offered at {1}{U}{B} and never for the alternative cost), a SYNTHETIC twin
>   per credit that its reader refuses, and the two quoted-ability sentences.
> · ⚠️ Found, not fixed (queued): **Lion's Eye Diamond makes three mana without discarding** — manaCostModelable's self-sac
>   branch admits the compound "Discard your hand, Sacrifice this artifact" cost (chip filed); **Mox Diamond** enters without
>   its discard (unmodeled replacement — honestly parked now, still played permissively); a labelled trigger whose ability word
>   `stripTriggerAbilityLabel` doesn't know ("Corrupted —") is invisible to `allTriggerSentencesModeled`'s count; a brace-cost
>   SECOND mana line still rides `isManaEffect` without a per-line runtime read; **landFullyCovered's isManaLine (the
>   precedent) reads a quoted ability too** — ablation credits three lands through it (Forgotten Monument, Riftstone Portal,
>   Command Power Plant: grants to other lands, no static descriptor) and the guard here cannot be copied verbatim (Nykthos and
>   four more begin "Choose a color. Add …") (chip filed); seven comments in enterReplacements / manaModel /
>   staticAbilityParser cite **CR 614.12b** for the choose-on-enter stamp — the rule is **614.12 / 614.12a** (614.12b is
>   simultaneous entries).

> ## 🔧 2026-10-16 — FIX: a one-shot source pays only when the cost needs it (a Swamp before a sacrificed Basal Sliver / Blood Pet) · **±0** · corpus 15,492
> Suite **19,005** green (1,781 files, 1 skipped), on top of the slice below. Flip-diff **0 / 0 / 0**. **Mutants 6/6**, restore
> byte-identical. Lint 0; citations 117 unresolved (the same 117 as 4463487c; this slice adds none). 48 July-list games: **2
> changed** — `f43823bb74ef0fe5` / `a0af9f80d934a7c9` (the slice below, twice) → `f43823bb74ef0fe5` (8, unchanged) /
> `a1426ff4670c7ebb` (40), twice.
> · **The bug** (found by the group-grant sacrifice-cost lane, 10-16). Generic already took one-shot sources last (`tapAny`);
>   a COLORED pip went to the least flexible source, board order breaking ties. Dark Ritual's {B} beside a Swamp sacrificed
>   Basal Sliver whenever the Sliver came first; Blood Pet (one color) beat a Bayou (two) outright; an Eldrazi Spawn paid a {C}
>   pip beside Sol Ring; Simian Spirit Guide (one color) was exiled before an untapped Taiga; and Ashnod's Altar sacrificed a
>   creature for generic whenever it came first among the rider sources.
> · **The fix — a two-pass plan, not a tie-break.** `planPayment` plans without one-shots first (`isOneShotSource`:
>   `sacrifices`, `sacrificesCreature`, `fromHand`); only if that fails does it plan with every source, exactly as before
>   (the storage-land two-pass inside, now `planPaymentRemovalAware`). Affordability is pass B's and never moves. Two rules
>   were tried first and refuted: "repeatable before self-sacrificing, flexibility within the class" makes payable costs
>   unpayable ({B}{G}{G} with Overgrown Tomb, Forest, Blood Pet: the Tomb goes to {B} and the second {G} is stranded);
>   "flexibility first, repeatable as the tie-break" taps a Swamp for Doom Blade's {B} and then still sacrifices the Sliver
>   for its {1}, where the Sliver's {B}{B} alone pays both.
> · **⚑ Taken on purpose:** a land taps rather than a creature dying — Blood Pet beside a Bayou paying {B} taps the Bayou
>   (its {G} is gone for the turn; the Pet stays).
> · **Differential, 20,000 trials** (random boards incl. Treasure, Eldrazi Spawn, Blood Pet, Basal Sliver, Ashnod's Altar with
>   Grizzly Bears, Lotus Petal, a Simian Spirit Guide in hand 30% of the time; slice 1 vs this): affordability agreed on all
>   20,000. The old plan used a one-shot in 3,562 payable trials; this one used fewer in 594 and more in none. 277 other plans
>   differ with no one-shot on either side: Crystal Vein's free {C} joins slice 1's promotion once its sacrifice line is out
>   of pass A. 0 plans failed pool + taps − spend ≥ 0. Seen to fail: with the fallback removed it disagreed 2,716 times.
> · **⚑ Results (flag to Omnath):** 2 of the 48 games change and neither winner does. Seed 608488833: Vihaan, Goldwaker
>   casting its commander keeps a one-shot and taps a land (its permanents 8 → 9; the game ends a turn sooner). Seed 3615280302:
>   Jurassic Ramp's Sunfrill Imitator keeps a one-shot and taps a mana creature (permanents 35 → 36). Games per minute
>   unchanged. An action-set change wherever a one-shot sits beside a source that could pay — rare in these lists; whether it
>   moves the epoch cut is Omnath's call.
> · Witness `oneShotSourcesLast.test.js` (8), through `legalActionsForPlayer` + `dispatchAction` on real oracle text: Dark
>   Ritual from Basal Sliver, Swamp (the Swamp; the Sliver lives) and from Blood Pet, Bayou (the Bayou); Lightning Bolt from
>   Taiga with Simian Spirit Guide in hand (the Taiga; the Guide stays in hand); Thought-Knot Seer's {3}{C} from Eldrazi
>   Spawn, Sol Ring, Wastes ×2 (the Spawn lives); Mind Stone from Ashnod's Altar, Grizzly Bears, Mountain ×2 (the Mountains;
>   the Bears live); Doom Blade's {1}{B} from Basal Sliver, Swamp (no plan spares the Sliver: its {B}{B} pays both and the
>   Swamp stays up — pass B unchanged); Dark Ritual with only Blood Pet (offered; the Pet pays).
> · Not covered here: a Sliver whose sacrifice is GRANTED by Basal Sliver is not yet a one-shot on master — the group-grant
>   path drops the sacrifice cost (Muscle Sliver's granted record reads `sacrifices: false`, a free {B}{B}). The group-grant
>   lane's fix makes those records one-shot, and this pass then spares them with no change here.

> ## 🔧 2026-10-16 — FIX: the auto-tap pays generic with a PLAIN COLORLESS source first (Mountain ×3 before Sol Ring) · **±0** · corpus 15,492
> Suite **18,997** green at this commit alone (1,780 files, 1 skipped). Flip-diff **0 / 0 / 0**. **Mutants 17/17**, restore
> byte-identical. Lint 0; citations 117 unresolved (the same 117 as 4463487c; this slice adds eight, all resolve). 48 July-list
> games: **39 changed** — `a1a9f98e68c3b6c3` / `fdbb728c27d644a7` (4463487c, twice) → `f43823bb74ef0fe5` (8) / `a0af9f80d934a7c9`
> (40), twice.
> · **The bug** (stoic-perlman's chip task_24aa20f2, 10-16). `planPaymentCore.tapAny` paid generic with the first untapped
>   non-sacrifice source in board order. Measured through `legalActionsForPlayer` + `dispatchAction`, empty pool, Lightning Bolt
>   in hand, Purphoros, God of the Forge's {2}{R}: Mountain, Mountain, Mountain, Sol Ring tapped all three Mountains, left the
>   Ring up and the Bolt dead; Sol Ring first tapped the Ring and one Mountain, Bolt live. Lands usually reach the battlefield
>   before rocks, so self-play mostly saw the bad order.
> · **The fix.** `tapAny(owed)`: a PLAIN COLORLESS PERMANENT first — every record it offers here colorless, none carrying a
>   rider — the smallest that covers the generic still owed (else board order); then the other repeatable sources in board
>   order; a sacrifice source last (unchanged). The source-side twin of `GENERIC_SPEND_ORDER` (be159bdf): any mana pays generic
>   (CR 107.4b), colorless pays little else (CR 107.4c), so the colored sources are the ones kept untapped.
> · **⚑ The decision — a colorless source that OVER-produces still goes first** (Sol Ring for a lone {1} floats a {C}). The
>   surplus floats to the end of the step (CR 106.4) and the next payment spends it first (pool-first, colorless first), so
>   inside the step the colored source kept untapped pays everything the Ring would have, and a colored pip besides. It loses
>   only when the surplus goes unspent AND a later step wants more mana than color (an instant on an opponent's turn). The
>   planner sees the cost, not the hand; the over-producing case is exactly where the Bolt bug recurs ({1}{R} from Mountain,
>   Mountain, Sol Ring), so keeping the color is the safer guess. Among colorless sources, the smallest that covers what is
>   still owed: Mind Stone pays a {1} before Sol Ring, Sol Ring a {2} exactly, Thran Dynamo alone a {2} beside Wastes. The
>   first cut took the LEAST SURPLUS — every source smaller than what is owed has none, so it took the Wastes, still needed
>   the Dynamo and floated two where the old board order (Dynamo first) floated one; the slice-2 differential caught it
>   before landing.
> · **Riders keep a source where it was — a whitelist, not a list of riders.** `PLAIN_TAP_FIELDS` names the record fields that
>   are not riders (`permanentId`, `colors`, `amount`, `bonus`, `used`); any other field set — life, a sacrifice, an exile,
>   counters, a skipped untap, tapping others, a spend restriction, snow — keeps the record out, a rider added later included
>   (a new field costs a source its promotion, never grants one). A corpus scan of the 496 cards that build a colorless record
>   found five of the planner's riders on no colorless card today (`painColors`, `exilesGyCard`, `fromHand`,
>   `doesNotUntapNext`, `extraTaps`): a blacklist would have held five guards no real card can trip. Judged PER PERMANENT: a
>   colored second line (Mogg Hollows), a sacrifice line (Crystal Vein), a spend-restricted line (Eldrazi Temple, for an
>   Eldrazi) or a storage land's counter line keeps the whole permanent in board order. The last is a legality guard: in the
>   two-pass plan, promoting Mage-Ring Network's plain {C} spends the {T} its counter line needs, and the activation stopped
>   being offered.
> · **Never the permanent whose own ability is being paid for.** `applyActivateAbility` passes `activatingPermanentId` and
>   the promotion skips it: Mutavault paying its own {1} would animate TAPPED (no attack, no block). The AI never animates a
>   creature-land (not one of its safe ability ops), so self-play is untouched; the app auto-pays a human player's
>   activations, so it is user-facing. Found reading the tripwire's Mutavault rows (below). Affordability is order-free, so
>   legalChoices passes nothing new.
> · **New record field `staysTapped`** (manaSources, CR 502.3). Mana Vault, Basalt Monolith and Grim Monolith built the same
>   record as Sol Ring ({C}×3, no rider) — the untap step reads the lock off the card. Stamped with the untap step's own read
>   (`cardSelfPreventsUntap`), so a Monolith is never promoted to pay a {1} and lose its next turns. Corpus record diff (every
>   card that adds mana, one synthetic board, 4463487c vs this; 2,980 scanned, 1,816 with records): five cards gain the field —
>   the three rocks, and Jasconian Isle and Forsaken City (colored lands with the same lock, never read by the colorless-only
>   promotion); nothing else changes.
> · **Affordability unchanged — differential, 20,000 trials** (random boards of 34 real mana cards incl. Mage-Ring with
>   counters, random pools and costs, base vs this planner): affordability agreed on all 20,000; the new order picked other
>   sources in 4,721 of 12,232 payable trials; 0 plans failed the pool + taps − spend ≥ 0 check. Seen to fail: with
>   per-permanent judging off it disagreed 51 times.
> · **⚑ Results (flag to Omnath):** 39 of the 48 games change; the winner changes in 2 (seed 2579794627 ai2 → ai3, seed
>   2544873418 ai3 → ai2); none ends without a winner, before or after; the turn count moves in 8. The mechanism every time: a
>   generic payment taps a colorless rock instead of a land, the land stays untapped and the later offers grow (seed 199630467,
>   turn 6: Kellan of the West's Sensei's Divining Top paid by the rock — `own_untapped_lands` 0 → 1, `legal.n` 2 → 3). Games
>   per minute unchanged. An action-set change in nearly every game with Sol Ring: whether it moves the epoch cut is Omnath's
>   call. (The first cut, 82b0671b — least surplus — gave `080503154707e3ec` / `82057e3d911c3349`; the covering rule moves 7
>   of those games again, a Kinnan Mana Overload game among them, no winner.)
> · **Pins, each read first.** `enchantSubjectHosts.test.js`'s Stasis Cocoon pair read Sol Ring's tap-for-mana offer after
>   paying {1}{W} from four lands; the payment now taps the Ring, so the scoped-lock row failed and the mana-chokepoint row
>   passed for the wrong reason (proven: with `actionsTapForMana`'s lock check removed it stayed green). Both now pay from a
>   floating {W}{C} and assert the Ring is untapped; with the lock check removed the chokepoint row goes red. A DIVERGENCE
>   TRIPWIRE (a temporary patch logging every call where the new choice differs from the old, by test line; never committed,
>   restore byte-identical) over the full suite found seven more files: enumeration only (affordability probes), or committed
>   payments whose assertions don't depend on which source tapped — `cullingRitual` (Sol Ring / Mutavault pay part of the
>   {2}; the sweep and its mana are the assertions) and `decayChainPriest` (an animated Mutavault pays Chain Reaction's and
>   Pyroclasm's generic; damage and graveyards are the assertions). Read, unchanged.
> · Witness `genericTapOrder.test.js` (21), through `legalActionsForPlayer` + `dispatchAction` on real oracle text: both board
>   orders above (the same Ring + Mountain, the Bolt cast for 3); Lightning Strike's {1}{R} from Mountain, Mountain, Sol Ring
>   floats {C} and keeps a Mountain for the Bolt; Mind Stone pays a {1} before Sol Ring, Sol Ring a {2} before Mind Stone,
>   Thran Dynamo alone a {2} beside Wastes; a Treasure is still cracked last; a
>   plain Wastes is promoted; seven rider sources keep their place (Basalt Monolith, Mana Vault, Eldrazi Spawn, Ashnod's
>   Altar, Hall of the Bandit Lord, Snow-Covered Wastes, Mogg Hollows) and Wastes under Fertile Ground; Mage-Ring Network's
>   counters still pay; Mutavault animates untapped, and is promoted for another payment; `staysTapped` on the records.
> · ⚠️ Found, not fixed: (1) **Ancient Tomb deals no damage** — its record is a bare {C}{C} (the pain parsers need a colored
>   pip): a painless Ancient Tomb, the CREED's forbidden direction, older than this slice, and now promoted like Sol Ring.
>   Modeled as `painColors: ["C"]` it would drop out of the promotion with no change here. (2) Hand-blind trade-offs: a
>   colorless dork (Palladium Myr, Kozilek's Channeler) or creature-land tapped for another payment loses its attack or block;
>   the planner has never weighed any dork's. (3) Pool-first (stoic's note): a floating {R:2} beside an untapped Sol Ring pays
>   {2}{R} with both red and the Ring and floats {C}. The Ring taps in BOTH plans, so floating {R:1} instead of {C:1} is a
>   dominance, not a trade-off; the real judgment call is a pool that covers the cost alone ({R:3}: no tap, or tap the Ring
>   to keep {R:2}). Colton's call, asked. (4) Colored pips: `tapForColor` can sacrifice a one-shot (a Basal-Sliver-granted
>   Sliver, Blood Pet; an Eldrazi Spawn for {C}) beside an untapped basic — board order decides a least-flexible tie. Queued
>   as the next slice, stacked on this one (a two-pass plan: one-shots only when the cost needs them).

> ## 🔧 2026-10-16 — FIX: a granted mana ability is the quoted ability whole (Basal Sliver's sacrifice, Ninja Pizza's Foods) · a creature sacrificed for mana dies · **±0** · corpus 15,492
> Suite **18,998** green (1,781 files, 1 skipped; +2 files, +22 tests). Flip-diff **0 / 0 / 0** over 34,620 cards. **Mutants 16/16**,
> restore byte-identical. Lint 0; citations 117 unresolved (the baseline; this slice adds seven, all resolve). 48 July-list games:
> the 8 byte-identical (`a1a9f98e68c3b6c3`); 38 of the 40 byte-identical, two move as intended (`fdbb728c27d644a7` →
> `d88bd6338c7e81eb`). HEAD 4463487c reproduces the c1f630ab hashes.
> · **The bug** (found 2026-10-16 beside the Lion's Eye Diamond slice). The recipient side of a mana grant — `manaSources` and
>   `legalChoices.actionsTapForMana`, each with its own copy — rebuilt the granted record from `colors` and `amount` alone and
>   forced `requiresTap: true`. On a board: a Metallic Sliver beside Basal Sliver ("All Slivers have \"Sacrifice this permanent:
>   Add {B}{B}.\"") was `{B×2, sacrifices:false}`; it paid Sign in Blood and stayed, tapped, a source again after the untap; Mana
>   Reflection made it four; summoning-sick it was no source, though the ability has no {T}. A Food under Ninja Pizza tapped for
>   any colour every turn. Cheaper than printed. (Basal Sliver itself was right — its own production reads its self-included
>   quote.)
> · **Census** — every mana grant the parsers emit (group, counter-gated, Aura/Equipment, the Saga self-grant) over 35,748
>   cards: 37 specs. Three carry `sacrifices`: Basal Sliver's and Ninja Pizza's reach recipients with no production of their own
>   (the two phantoms); Goldspan Dragon's reaches only Treasures, which keep their own sacrifice through the supplement. Basal's
>   is the only cost with no {T}. `upgrade` (Jaheira, Night of the Sweets' Revenge, Goldspan, Ninja Pizza) and `via:"attached"`
>   (14 Auras/Equipment) route the grant and say nothing about the ability. No spec carries a mixed bundle, a restriction, a mana
>   activation cost or a life cost — `parseGrantedManaSpec` refuses each — and a recipient with no production of its own has no
>   card-keyed activation cost, spent rider or extra line to misattach.
> · **Fix, part 1.** `parseGrantedManaSpec` records `requiresTap:false` for a cost with no {T} (a {T} cost adds no key, the
>   printed-source convention). `manaModel.grantedManaProduction` returns the spec whole minus the routing markers;
>   `withGrantedMana` is the ONE read both sites make — own production (+ the dominating-grant supplement), or the grant whole.
>   A sacrifice without {T} is usable while summoning sick (CR 302.6) and is not tapping for mana (CR 106.12), so no doubler.
>   `commitManaTap` already sacrificed `tap.permanentId` — the recipient — once the record said so.
> · **Fix, part 2** (found checking that commit). A creature sacrificed for a mana cost never died. The self-sacrifice branch
>   moved the card and fired only the sacrifice watchers: an Eldrazi Spawn cracked for {C} beside Blood Artist drew no trigger
>   and no death count, and an opponent's Blood Artist never drained its controller. The Altar-victim branch built its own death
>   entry without the replacement flags — Ashnod's Altar feeding Memnite under Rest in Peace: exiled, yet Blood Artist triggered
>   and a death was counted (CR 700.4) — and never reached the sacrifice watchers (Korvold). Both now leave through
>   `sacrificeForManaCost`, `removal.sacrificeCreatureEffect`'s sequence: layer-aware types as it left (CR 603.10a),
>   `gameState.deathLookback`, the death-specific exile honoured, a replaced death logged, dies triggers, sacrifice triggers with
>   `lkiTypes`, the leave drain.
> · Witness `grantedManaAbility.test.js` (13) + `manaCostSacrificeDies.test.js` (9), real fixtures. Mutants (16): the whole fix
>   reverted (18 of 22 red; the 4 green are the controls) · the parser's `requiresTap` · the helper dropping `sacrifices`,
>   forcing `requiresTap`, keeping the routing markers · each site back on its own fallback · a grant replacing own production ·
>   no dies triggers · the printed creature test · the exile destination · no sacrifice watchers · no `lkiTypes` for them · no
>   replaced-death log · the Altar victim's old entry · the self-sacrifice's old path.
> · ⚑ **Results change (flag to Omnath), both traced on a board.** Seed 1087189617 (Vihaan, Goldwaker): turn 36, three
>   Treasures pay Mithril Coat's Equip {3}; one is a 3/3 Construct Assassin (Vihaan's combat animation), so it now DIES — Cruel
>   Celebrant and Pitiless Plunderer trigger and Teysa Karlov doubles each (stack 7 → 11, one death counted); Vihaan still
>   wins, on turn 38 instead of 41. Seed 1861743451 (Halfshell heroes): turn 21, paying for Voracious Hydra cracks a Food
>   under Ninja Pizza instead of tapping it (one permanent fewer); winner, turn count and decision count unchanged.
> · ⚠️ Found, not fixed (queued — a task chip for the first; the second is the type-line audit's sixth death site, one
>   slice): **the explicit tap-for-mana action ignores printed cost flags** —
>   `actionsTapForMana` re-reads production and carries none of `sacrificesCreature`, `activationCondition`, `extraTap`,
>   `payLife`, `painColors`: Ashnod's Altar TAPS (no {T} in its cost) for {C}{C} with nothing sacrificed, Mox Opal makes mana
>   without metalcraft, Birchlore Rangers taps only itself, Mana Confluence and Adarkar Wastes cost no life (the AI never takes
>   the action; a human can). **`actionDispatcher.sacrificePermanentForCost`** (activated-ability costs) builds the same
>   flag-less death entry the Altar victim had: Carrion Feeder eating Memnite under Rest in Peace fires Blood Artist and counts a
>   death. Also (safe under-offers): the planner takes Crystal Vein's {C} line first and then cannot pay {2} with the sac line;
>   a tapped permanent cannot use a no-{T} sacrifice; a permanent granted two mana abilities is offered the first;
>   `actionsTapForMana`'s sickness gate ignores `requiresTap:false`. Play quality: a colored pip's pick (`tapForColor`) does not
>   prefer a repeatable source the way generic does, so a Basal-granted Sliver can be sacrificed for {B} beside an untapped
>   Swamp (battlefield order decides) — pre-existing for Basal itself, Blood Pet, a Spawn's {C}.

> ## 🔧 2026-10-16 — FIX: a self-sacrifice mana cost with a discard beside it refuses (Lion's Eye Diamond, Overeager Apprentice) · **−2** · corpus 15,490
> Suite **18,954** green (1,777 files; the one skip is optionalModeKeywords' standing SUPERSEDED pin). Lint 0. Flip-diff
> **0 / 2 / 0**, both LOST rows deliberate (below). **Mutants 5/5**, restore byte-identical. manaProduction drift probe
> over all 36,462 index cards: **4 change** (production → null), each audited; every other card's production, activation
> cost and extra mana lines are byte-identical. Corpus 15,492 → 15,490.
> · **The bug** (found auditing the native-mana tier). `manaCostModelable`'s non-{T} branch accepted ANY cost containing
>   "Sacrifice this …", so Lion's Eye Diamond ("Discard your hand, Sacrifice this artifact: Add three mana of any one color.
>   Activate only as an instant.") was a plain one-shot source and `manaCostConsumable` never saw the discard. Driven on a
>   board: Phyrexian Arena cast off the Diamond alone, the Diamond to the graveyard, Grizzly Bears and Night's Whisper still
>   in hand. Overeager Apprentice ("Discard a card, Sacrifice this creature: Add {B}{B}{B}.") the same. **Sibling asymmetry:**
>   Diamond Lion prints the Diamond's cost behind a {T}, and the {T} branch's compound-cost guard refused it all along.
> · **The fix.** One residue rule for every cost shape: mana symbols + ONE self-sacrifice phrase ("Sacrifice this <noun>") +
>   separators, nothing else. The noun is one word now (the old {T} strip ate everything up to the next comma, so "Sacrifice
>   this artifact and a creature" passed), and a self-included has/have grant's preamble ("All Slivers have") is not a cost
>   item. Refused, not charged: an honest under-offer.
> · **Census** (bundled index): 303 printed self-sacrifice mana lines (mostly token reminder text the parse strips) → 30
>   cards with a runtime production → exactly **2** with a consumable beside the sacrifice. The mana-costed self-sacrifices
>   (Chromatic Star, Coal Golem, Kaleidostone, the Invasion Attendants, Satyr Hedonist) were already charged by
>   `manaActivationCost`; unchanged.
> · **LOST 2, both deliberate FP removals:** Lion's Eye Diamond and Overeager Apprentice, native-mana → body-only. The tier
>   stood on a production that credited mana for a cost nobody paid.
> · **Runtime-only changes** (invisible to the tier diff, seen by the drift probe): **Oddric, Lunar Marquis**: the old branch
>   read the quote he only SHARES ("… and the activated ability \"Sacrifice this creature: Add {C}.\"") as his own, so he could
>   sacrifice himself for {C}; now no source. **Rain of Filth**: an instant's "lands you control gain \"…\"" quote; inert.
> · **Caught before handoff:** the first cut read Basal Sliver's "All Slivers have \"Sacrifice this permanent: Add {B}{B}.\""
>   preamble as residue. Its own production went null and `manaSources` fell back to the GROUP-GRANT path, which drops the
>   spec's `sacrifices`, so the Sliver tapped for {B}{B} every turn. Seen on a board, fixed by the preamble rule, pinned.
> · Witness `selfSacCompoundManaCost.test.js` (10, 8 of them red at the parent): both carriers' productions and both on a
>   board (no record, no tap-for-mana action, nothing castable), a clean Lotus Petal paying on the same board, the
>   second-victim probes, Basal Sliver's single sacrificing record, Oddric and Rain of Filth, the tier move.
> · **BANKED: charging the discard** (not a quick slice; four new mechanisms). ① "Activate only as an instant" (CR 602.5e)
>   means only with priority, never inside a payment (CR 601.2g / 605.3a; the Diamond's one ruling, 2004-10-04, says the
>   same), so the Diamond can only ever be a priority-time float (the tap-for-mana action), never a `planPayment` source.
>   ② The discard goes through the discard chokepoint (madness, discard triggers), and the Diamond's takes any card about to
>   be cast from hand with it. ③ The Apprentice's "Discard a card" needs a chosen card that is not the spell being paid for,
>   so the planner must know the spell's card. ④ Payment policy: the auto-payer must never burn a hand for mana.
> · ⚠️ Found, not fixed (filed as tasks): the group-grant fallback in `manaSources` / `actionsTapForMana` drops the granted
>   spec's `sacrifices`, so every Sliver with no mana of its own taps for a repeatable {B}{B} beside Basal Sliver today
>   (Metallic Sliver, on a board); a double-faced card whose BACK face is a land is parsed as a land on its front face (Storm
>   the Vault offered as a self-sacrificing {U}-per-artifact source, Drowner of Truth a pay-{C}-for-{C} sacrifice). Seen,
>   not queued: Rhystic Cave's "unless any player pays {1}" and Mana Screw / Everythingamajig's coin flip are ignored by the
>   mana parse.

> ## 🎯 2026-10-16 — PLAY-WEIGHTED: the Adventure lane takes ENCHANTMENT halves — Virtue of Persistence (EDHREC #2004), Virtue of Knowledge (#2251), Virtue of Loyalty (#2621) · **+4** · corpus 15,496
> Suite **18,999** green (1 skipped; 1,780 files). Flip-diff **+4, −0, RETIERED 4** (non-native → non-native, arbiter-spell →
> body-only): Virtue of Persistence, Virtue of Knowledge, Virtue of Loyalty and An Unexpected Party → native-mixed. Top 1,000
> **904**; top 2,500 **1,745** (+2 — Persistence and Knowledge; Loyalty sits at play position 2,610, just outside). **Mutants
> 6/6** on assertions, restore byte-identical. Gates run on master 4463487c (rebased; the same diff as on c1f630ab). Committed on
> `claude/practical-khayyam-9fb759` for the integration batch — not pushed by this seat; the release-batch line and the
> WAKE-REPORT counters are the integrator's.
> · **The gap.** `adventure.parseAdventureCard` returned null unless the permanent half was a Creature, so an enchantment Adventure
>   never reached `classifyAdventure`: its combined "Enchantment // Sorcery — Adventure" type line fell to the instant/sorcery
>   classifier (arbiter-spell), and at runtime the combined card rode the generic cast builder as one spell — Virtue of Courage
>   was offered at {4}{R}{R}{R} (both halves summed) and at instant speed on an opponent's turn (measured at c1f630ab). Nothing
>   in CR 715 is creature-specific (715.2; 715.3d — the exiled card may be played; 715.4).
> · **The change.** The permanent half may be a Creature (unchanged, an Artifact Creature included) or a plain Enchantment — no
>   other card type and no subtype, which is every enchantment Adventure in the corpus. Renamed to say what they hold: `creature` →
>   `permanent` in the parsed shape, `creatureFaceCard` → `permanentFaceCard`, `actionsCastCreatureFromHand` /
>   `actionsCastCreatureFromAdventureExile` → `actionsCastPermanentFromHand` / `actionsCastPermanentFromAdventureExile`.
>   `classifyAdventure` judges the enchantment face with the same `classifyCard` a lone enchantment gets and the Adventure face
>   with `spellIsNative`. The runtime needed no new mechanism: the face lane already enters any permanent face through
>   PERMANENT_ETB with the whole card as `printedCard`, and `enterPermanent` stamps summoning sickness by the entering type, so an
>   enchantment half enters unstamped (CR 302.6).
> · **Parked, with the half that holds each** (all four arbiter-spell → body-only — the enchantment casts at its own cost and
>   sorcery timing; the Adventure is never offered): Virtue of Strength (#2775 — the basic-land mana tripling), Virtue of Courage
>   (#3995 — the noncombat-damage impulse trigger), Promise of Aclazotz (both halves: the end-step sacrifice-populate and Foul
>   Rebirth's "if you do" token), Porcine Portent (conjure, digital-only). ⚑ Their enchantment now casts and its unmodeled text
>   is inert — the trunk's posture for every body-only enchantment (no Arbiter flag rides a body-only permanent).
> · **Stage ③ · 40 was already on master:** 3fb0e468 (its comment says ③ · 39) made an any-graveyard reanimate read intent "any";
>   Persistence's upkeep trigger rides it unchanged — Debtors' Knell's line, now driven through the Adventure lane too.
> · **Citations corrected** in the comments this slice rewrote: CR 715.3e was cited for the cast from exile (there is no 715.3e;
>   it is 715.3d), 715.2b for "only its creature characteristics" (715.2b is copiable values; that rule is 715.4), 715.1 for "the
>   Adventure is an instant or sorcery" (that is 205.3k — Adventure is a spell type).
> · Witness `enchantmentAdventure.test.js` (23; one SYNTHETIC — the Aura-typed guard): the shape and its guards (artifact, land and
>   sorcery halves; an enchantment with a subtype; the Artifact Creature still in), the metric with each parked card's blocking
>   half, and each flip's lifecycle through the real engine — Locthwain Scorn kills the opponent's Bears, the Virtue casts from
>   exile at {5}{B}{B} and steals them at the upkeep; Ardenvale Fealty at instant speed, then the end-step counters and untap;
>   Vantress Visions copies Phyrexian Arena's trigger, then the Virtue makes Elvish Visionary draw two; At the Door's Dwarves get
>   +2/+2 from the Party. A vacuity control on each, and the summoning-sickness contrast (a creature half from the same lane enters
>   sick). `adventure.test.js` / `cullingRitual.test.js` follow the renames; `anyGraveyardReanimate.test.js`'s parked note rolled
>   forward. The mutants: the enchantment half refused, its anchor loosened, the permanent-half gate removed, the permanent-half
>   native check removed, and each cast generator skipping a non-creature face.
> · ⚠️ Found, not fixed (queued): the 8 ARTIFACT Adventures ride the same face lane with an Artifact half — both faces of The
>   Arkenstone and Horn of Valhalla already classify native; the 6 Town lands' Adventures need a play-the-land-from-exile offer
>   (CR 715.3d says "play") — both faces of Jidoor, Aristocratic Capital and Value Town already classify native.
>   `scripts/slice-manifest.json` (a generated snapshot) lists the eight enchantment Adventures under transform-dfc until rebuilt.

> ## 🎯 2026-10-16 — THE TURNED-FACE-UP WATCHER (P·19's follow-up): a manifest turned face up fires its watchers · **+15** · the ten P·19 losses regained
> Suite **18,977** green (1 skipped) and `npm run lint` 0 on 4d599284 + this slice (18,976 on c1f630ab + it); rebased onto 4463487c afterward,
> its 20 overlapping test files (the slice's, the death-event / count-scope / spend-order ones, the LKI stamp's) re-run green there (418) — the
> integration gate runs the full suite. CR citations unchanged (117 nameless, none on this slice's lines). Flip-diff **+15, −0, 0
> retiered** (tier snapshots at c1f630ab → the change; 15,487 → 15,502 native names; every GAINED oracle read whole, below). **Mutants 30/30**
> (restore byte-identical). None of the 15 ranks in the top 2,500 (highest: Deathmist Raptor #6,732); the deck shelf was not re-measured.
> · **The event.** `turnedFaceUp`, fired by `actionDispatcher.applyTurnFaceUp` (`triggers.checkTurnedFaceUpTriggers`) right after the flip and BEFORE
>   the state-based check: the board right after the event decides (CR 603.10), so a permanent's own ability sees its own flip and a creature its new
>   toughness kills is still the referent. The flipped permanent is the triggering permanent (the ETB-referent sentinel pattern). The flip now
>   flushes (CR 603.3 — the cycling precedent); P·19 left a flip's dies triggers pending until a later checkpoint.
> · **The subjects** (`triggers.classifyTurnedFaceUp` — every condition naming a flip is decided there, first): "a permanent" → anyPermanent;
>   "a permanent you control" / "a face-down permanent you control" → permanentYouControl; "another permanent you control" → otherPermanentYouControl
>   (new scope); "a creature you control" and "this creature or another creature you control" → creatureYouControl; "<this …> or another permanent
>   you control" → permanentYouControl; "this creature or another permanent" → anyPermanent; "a <creature type> you control" → subtypeYouControl
>   (validated against CR_CREATURE_TYPES); "enchanted creature" → equippedCreature. The card's OWN flip stays refused (withheld and stripped — P·19);
>   every other flip condition is refused: Mistway Spy's delayed-setup wrapper (the flip must END the condition) and a compound like "dies or is
>   turned face up", which would otherwise fall through to the dies arm with its flip half dropped.
> · **"if it's a creature"** (interveningIf.js): the triggering permanent's live, layer-aware creature-ness at the flush and on resolution (CR 603.4 —
>   Salt Road Ambushers' ruling), its flip-time record (`triggeringWasCreature`) once it is gone, so a flip whose new toughness kills the creature
>   still puts the modeled program on the stack rather than an unreadable condition.
> · **The referents** (`rewriteTurnedFaceUpReferent`, each payoff matched whole): "put two +1/+1 counters on it", "it gets +2/+2 until end of turn",
>   "untap that creature", "put +1/+1 counters on that creature equal to its power", "put a +1/+1 counter on it and a +1/+1 counter on this creature",
>   "that creature deals damage equal to its power to each opponent" (the turned-up creature is the dealer — effects/atoms/stack.js; its last known
>   power via gameState.stampTriggeringLki, the card's ruling), "destroy it. It can't be regenerated".
> · **Deathmist Raptor** functions from the graveyard (the Bloodghast landfall scan's shape). The return is FACE UP — the face-down choice isn't
>   offered: a face-down Raptor turns up only for its megamorph cost, which the engine never offers, and the engine's face-down turn-up is the
>   manifest's mana-cost flip, which it would wrongly be handed. A narrower choice, never a wrong one (the "may" is taken, as Bloodghast's is).
> · **The watcher disjunction** "a Detective you control enters or is turned face up" splits into its two events (Case of the Pilfered Proof),
>   counted in compoundTriggerCount; the SELF form is not split.
> · **FIXED — two hollows found on the way.** (1) P·19 offered the manifest flip to a card whose own text reads "enters or is turned face up" (Gadget
>   Technician, Ponyback Brigade, Efreet Weaponmaster, Offender at Large, Rakish Scoundrel — native for the enters half), and the flip half never
>   fired; `coverage.hasSelfTurnedFaceUpTrigger` now withholds the flip (also Concert Kaboomist, Flavor Disaster's "or when it's turned face up",
>   Crowd-Control Warden's "As …"). The sentence is never stripped — its enters half is real. (2) Kaust, Eyes of the Glade's "a creature you control
>   that was turned face up this turn deals combat damage to a player" classified as a SELF combat-damage trigger (the "this" of "this turn" read as a
>   self reference): at runtime Kaust drew a card whenever it connected. Refused now.
> · **GAINED 15, every oracle read whole:** Aven Farseer (Flying; a counter on itself), Aphetto Runecaster (may draw), Bonethorn Valesk (1 damage to any
>   target), Unblinking Bleb (Morph; may scry 2 — its own flip too), Pine Walker (Morph; untaps the flipped creature — itself too), Experiment Twelve
>   (Trample, Disguise; counters equal to the flipped creature's power), Salt Road Ambushers (Megamorph; two counters on ANOTHER creature turned up),
>   Sumala Sentry (Reach; a counter on each), Pyrotechnic Performer (Disguise; the flipped creature's power to each opponent), Deathmist Raptor
>   (Deathtouch, Megamorph; back from the graveyard), True Identity (Disguise; scry 1, draw, once each turn), Mastery of the Unseen (life per creature;
>   the {3}{W} manifest — native-mixed), Fatal Mutation (destroys the enchanted creature as it turns up), Projektor Inspector and Perimeter Enforcer
>   (the Detective compounds).
> · Re-pointed pin (1): realityShift.test.js — P·19's "a watcher is residue" row: Mastery of the Unseen is native-mixed now, Trail of Mystery stays
>   body-only (its face-down enters watcher).
> · **Runtime:** `WITNESS turnedFaceUpWatchers {"farseer":1,"twelve":[12,10],"raptor":["Craw Wurm","Deathmist Raptor"],"pyrotechnic":6}` — every
>   regained card played through the real path (the offer, the special action, the stack). Witness `app/src/lib/learn/turnedFaceUpWatchers.test.js` (33).
> · ⚠️ Found, not fixed (queued): (a) the "this turn" self-misread is a CLASS — `classifyCondition`'s selfRef counts the "this" of "this turn": 22
>   descriptors corpus-wide, none native, but one body-only permanent fires wrongly at runtime: Maeve, Insidious Singer's goad rider ("Whenever that
>   creature attacks one of your opponents this turn, you draw a card") is read as Maeve's OWN attack trigger, so Maeve draws whenever she attacks.
>   (On Pick Up the Pace, an enchantment that never attacks, the misread only silences its real trigger.) A shared-path fix with its own flip-diff.
>   (b) Temur War Shaman's watcher waits on
>   "you may have it fight target creature you don't control", unmodeled even in the self form (Somberwald Stag, Affectionate Indrik) — one lane covers
>   all three. (c) Trail of Mystery's and Cryptid Inspector's "a face-down … enters" watchers; Secret Plans' and Roshan's face-down statics; Printlifter
>   Ooze's token entering with counters. (d) The AI's turn-up policy ignores watchers (it flips only a manifest bigger than a 2/2).
> · For the integrator: games that turn a manifest face up play differently now (the watchers fire; the flip flushes) — replay hashes over such games
>   move.

> ## 🔎 2026-10-16 — THE TYPE-LINE AUDIT: readers that asked the PRINTED type line a question layer 4 answers · **±0** · corpus 15,492
> Suite **19,031** green (1 skipped; 1,781 files). Flip-diff **0 / 0 / 0** (34,620 cards). **Mutants 53/53**, restore
> byte-identical. Lint 0; CR citations: no new dead cite (117 before and after, all pre-existing). 48 July seeds: **13 games
> change** (2 of 8, 11 of 40; one winner flips), every one traced to its first diverging event and every one the rules' answer
> (below); no slowdown (16 s / 77 s against 17 s / 81 s).
> · **The audit.** P·21 (Dryad of the Ilysian Grove) made the land-type readers see a granted subtype and #511 (Liquimetal Torque)
>   the artifact readers a granted card type; this pass swept every remaining engine reader that tests a battlefield permanent's
>   printed `card.type` (three read-only lanes over 72 files, ~340 sites; every FP claim reproduced on the live engine before it
>   was fixed). The false positives ran BOTH ways round: a type a layer-4 effect REMOVED was still read as present — a Theros God
>   below its devotion, a bestowed Aura, an attached reconfigure Equipment and a slumbering Arixmethes counted as creatures for
>   costs, targets, sweeps, counts, triggers and mana — and a type an effect ADDED was read as absent by every "non-<type>" read
>   (an animated land offered to Bramblecrush's "noncreature permanent"; a Metallic Mimic that chose Dragon destroyed by Crux of
>   Fate's "non-Dragon"). Printed whole-line reads also took a double-faced card's back face (Armageddon destroyed Ojer Taq;
>   Ashnod's Altar ate a Westvale Abbey and Springleaf Drum tapped one — the mana-model payers now read `permanentHasCardType`,
>   the face that is up, which the derive's own types won't until the double-faced root is fixed).
> · **The readers.** `layers.permanentHasTypeWord` (new) is the one exact answer for a type word on a battlefield permanent: a card
>   type or supertype through `permanentHasCardType`, a creature type only while it is a creature or a kindred (CR 205.1a — a God
>   below its devotion is no God), any other subtype through `permanentSubtypes` (new; the front face's discipline).
>   `layers.entersAsCreature` (new) answers "a creature as it enters" (CR 614.12 — a bestowed card, a God whose own pips leave it
>   below its devotion). `legalChoices.sacTypeMatchesNow` and `removal.sacrificePoolMatchNow` are the battlefield twins of the
>   card-level cost and edict pools.
> · **Inside the derive (no recursion).** The layer-7 board counts and gates read card-type needles through the recursion-free
>   `effectiveTypeIdentity` (`countsAsNeedleInDerive`), skipped on a board with no layer-4 card-type effect; the identity read now
>   also mirrors Arixmethes' self Land add. Battle Squadron no longer counts a God below its devotion; Briarberry Cohort's
>   "another blue creature" and Watchwing Scarecrow's "a blue creature" gates stay shut beside one; Spur Grappler's "no untapped
>   lands" sees an untapped slumbering Arixmethes. Subtype needles stay printed — a documented under-count (the dynamic subtype
>   adds, Urborg / Dryad, are not mirrored), the safe direction for "count what you control". layers.js calls no interveningIf.
> · **Triggers.** `gameState.lastKnownIsCreature(lookback, state)` reads a LIVE permanent through the layers (every trigger creature
>   scope: enters, becomes target, counters, tapped, attack, damage); a leave event carries `lkiTypes` from the board it left (the
>   single and batched leave look-backs keep them), as do the cost sacrifice (`sacrificePermanentForCost` now builds the one
>   `deathLookback`, so a creature exiled or shuffled instead never "died"), the Saga sacrifice and the mana sacrifice. Soul Warden
>   doesn't fire for Purphoros entering below its devotion; Ninth Bridge Patrol doesn't for Thassa leaving; Teysa doesn't double it.
> · **Decided (task point 5):** the resolution / mana counts (`shared.countMatchesPerm`) run outside the derive, so they read the
>   permanent exactly — that closes the FP (Gaea's Cradle counted a God below its devotion) and, as a side effect, Cabal Coffers now
>   counts the Swamps Urborg makes (FN fixed). The in-derive counts (point 4) stay printed for SUBTYPES by design (recursion).
> · ⚑ **Action-set / result changes (flag to Omnath):** every offer and count above changes for a board holding a God below its
>   devotion, a bestowed Aura, an attached reconfigure Equipment, a slumbering Arixmethes, an animated or crewed permanent, a
>   Metallic Mimic, or a double-faced permanent. The 13 replay games, by cause (each first diverging event found on both engines):
>   - **An earthbended land is a creature** (8 games). Badgermole Cub's "Whenever you tap a creature for mana, add an additional
>     {G}" now applies to it (40-seed #2: Earth Bent casts Mossborn Hydra on turn 11 and wins at turn 35 — the base had Vihaan win
>     at turn 41; #5: Kinnan's payment leaves Delighted Halfling untapped to attack; #11: cdh casts Chord of Calling in its turn-9
>     upkeep; #19 and 8-seed #2: one more {G}). Craterhoof Behemoth's X counts three of them (#9: +5/+5 → +8/+8; the pumped set was
>     already those 8 creatures). The Ozolith triggers when one dies (#18, #21 — its "if it had counters" fails). The Wise Mothman
>     and Phyrexian Metamorph may choose one (one more candidate; the same picks).
>   - **A bestowed Springheart Nantuko is not a creature** (40-seed #24, #26): Gaea's Cradle makes one less ({G}{G}{G} → {G}{G}).
>     #24: Candelabra of Tawnos loses 64 X options and Chord of Calling fetches at X=4 (Phyrexian Metamorph) instead of X=5
>     (Seedborn Muse), the game ending at turn 38 instead of 41; #26: Phyrexian Metamorph is not castable that turn and Growing Rites
>     of Itlimoc's "four or more creatures" fails.
>   - **A double-faced permanent is its front face** (3 games): The Legend of Yangchen (a Saga) gets no +1/+1 from Stagecoach
>     Security (8-seed #1 — later ids renumber by 2, so the same Vega blocks under a new id); Invasion of Tarkir (a Battle) fires no
>     Dragon Tempest or Miirym trigger as it enters (40-seed #17), satisfies no Mox Jasper ("Activate only if you control a
>     Dragon"), so Sarkhan, Fireblood is not cast, and is no Wise Mothman target (40-seed #30).
> · Witnesses `typeLineLayerReaders.test.js` (14) + `typeLineLayerActions.test.js` (41): real-card pairs — the permanent a layer-4
>   effect changed beside a plain one.
> · ⚠️ Found, not fixed (queued — low or another seam): Homeward Path's printed creature check (control.js stays a leaf); the
>   trigger subtype scopes (permMatchesSubtypeFilter — FP only via bestow / Mistform / a copy); Intervene's spell-target filter;
>   soulbond pairing and bond (the bond is read inside the collection); the bestow-cast spell read as a creature spell ON THE STACK
>   (Essence Scatter can target it, Karametra triggers — CR 702.103b); Hardened Scales / High Score / Neriv apply with no recipient
>   or source type check; Kinnan's bonus attached to Ashnod's Altar; layer-1 copies whose readers read printed abilities
>   (attackTax, urDragonAttack, Padeem's mana value); `selfReturn.stripCreatureFromCard` bakes a type removal into the card; the
>   Aura resolution re-check's printed host type; historic, the activated-ability reducers' land / artifact / subtype subjects,
>   Equip legendary and "Tap an untapped <Subtype>" (FP only via a rare removal); an animated planeswalker is now hit as a creature
>   AND as a planeswalker by "each creature and each planeswalker" (Storm's Wrath — both results are the rules', CR 120.3, but the
>   source's dealt total counts it twice; no carrier has lifelink or a dealt-by payoff today); the cost sacrifice
>   (`sacrificePermanentForCost`) builds the shared `deathLookback` but logs no replaced death (a sixth `deathEventKind` site,
>   unchanged); `countGraveyardSpec`'s head bleed (a Westvale Abbey card counts as a creature card for Tarmogoyf); the dynamic
>   subtype adds not mirrored in `effectiveTypeIdentity` (FN for selectors and in-derive counts). The double-faced root
>   (`cardTypesOf` / `subtypesOf`: Westvale Abbey derives Creature, Growing Rites of Itlimoc derives Land) is zealous-hofstadter's
>   slice; `permanentIsCreature`, `permanentTypes` and the leave `lkiTypes` still see that bleed until it lands (no worse than the
>   printed reads they replaced), and `permanentSubtypes`' front-face filter becomes redundant after it.

> ## 🔧 2026-10-16 — FIX: the layer derive reads a double-faced permanent's FACE THAT IS UP (CR 712.8d) — Westvale Abbey no longer dies as it enters · **±0** · corpus 15,492
> Suite **18,986** green (1 skipped; 1,780 files). Flip-diff **0 / 0 / 0** over 34,612 cards — the tier classifier reads only
> `layers.staticEffectsOf`, never the derive, so this runtime change cannot move a tier; its witness is the test below.
> **Mutants 9/9**, restore byte-identical. Lint 0; CR citations: no new dead cite (117 before and after, all pre-existing).
> Built off c1f630ab and rebased onto 4463487c; every gate above re-run on the rebased tree. The 10-01 queue item "the layer
> derive reads a double-faced card's whole type line", made concrete by the 10-16 changeling slice's report (its found-not-fixed
> Westvale Abbey / Heirloom Mirror item is this fix).
> · **The bug** (reproduced at c1f630ab): a nonmodal double-faced card whose front face prints no subtype dash and whose back face
>   is a creature died the moment it reached the battlefield — Westvale Abbey as the land drop, Heirloom Mirror cast: a
>   `creature-dies` entry, cause `sba`. All 20 permanent cards of that shape in the bundled snapshot.
> · **The cause.** `layers.cardTypesOf` / `subtypesOf` read the combined "Front // Back" line (`cardIndex.publicCard` keeps
>   Scryfall's `type_line`): the card types were the words left of the line's first dash, so Westvale Abbey derived as
>   `[Land, //, Legendary, Creature]` with the front face's null power and toughness — a 0/0 creature for CR 704.5f — and the
>   subtypes were everything right of it, the back face's included.
> · **The fix.** `layers.faceUpTypeLine` (exported — the mana lane imports it): both helpers read the front face. The engine never turns a back face up (CR 712.8d/f,
>   712.14; an unflipped flip card 710.2; an adventurer 715.4; a Room's halves share one line, 709.5; a copy copies the face that
>   is up, 707.8). It feeds both derive paths and `effectiveTypeIdentity`, so every selector (anthems, lords), the host-subtype
>   and host-legendary gates and every layer-aware reader see the face that is up. The hand-made front-face filters in
>   `permanentHasCardType`, `permanentCreatureTypes` and Culling Ritual's nonland sweep (`shared.nonlandPermanentsWithManaValueAtMost`)
>   gave the same answers on top of it and are collapsed (their comments described the old derive).
> · **What moves** (an inventory of the snapshot through publicCard + mergeCardData): CARD TYPES only for a front face printed
>   without a subtype — the 20 creature backs (now stay), and the land / planeswalker / artifact backs (Treasure Map, Search for
>   Azcanta, Liliana's Other Contract are no longer a land / a planeswalker; Yavimaya no longer makes Treasure Map a Forest);
>   SUBTYPES lose the separator and every back-face subtype on 366 transform, 26 flip and 166 adventure cards (90 distinct words:
>   Delver's Insect; Lunarch Veteran's Spirit — Supreme Phantom no longer pumps it; an Invasion battle's Elemental; "Adventure" on
>   150 adventurers). A modal face enters as its own card, split cards are no permanents, a Room's one line is unchanged.
> · **⚑ The mask it lifted (CR 701.3b, 301.5c).** The bleed made a back face's Equipment or Aura a subtype of the front face:
>   Halvar, God of Battle's Equip was refused only by accident ("an Equipment creature", 301.5c), and without the bleed it attached
>   a God to a creature. New `layers.cannotEquipNow` (not an Equipment right now, or barred as a creature) guards the Equip
>   resolver (`attach-refused`, rule CR 701.3b), the attach-pair atom and the AI's equip pick. It also closes false positives that
>   were live at c1f630ab (probed on both trees): Equip attached Sidequest: Play Blitzball's enchantment, Idol of the Deep King's
>   artifact and the Invasion of New Capenna battle to a creature, and Codsworth attached 15 of the 22 back-attachment permanents
>   (Dorothea, Vengeful Victim and ten more Aura-back creatures among them). Now none moves.
> · Witness `dfcFaceUpDerive.test.js` (10; 8 red at c1f630ab): the land drop and the cast through legalActionsForPlayer →
>   dispatchAction → resolution; all 20 creature backs; Glorious Anthem and Supreme Phantom (the selectors); Delver, a battle, an
>   adventurer, Treasure Map; a token copy of Heirloom Mirror (CR 707.8); Brass Squire with Halvar; all 22 back-attachments through
>   Equip and Codsworth, with a coverage witness (6 Equip offers, 22 Codsworth offers exercised). Updated: `equipOfferParity`
>   (Halvar's refusal now reads CR 701.3b), `cullingRitual` (its pinned bug field `azcantaReadAsLandByTheLayerDerive: true` is now
>   `azcantaIsALandToTheLayerDerive: false`; the sweep's outcome is unchanged).
> · Mutants: `faceUpTypeLine` back to the whole line · subtypes only · card types only · `cannotEquipNow` without its
>   not-an-Equipment arm · the attach-pair guard · the AI pick's guard · the resolver's rule label · the resolver's guard · the
>   Culling Ritual sweep sparing every multi-face permanent.
> · **⚑ Epoch flag (results change in any game holding an affected card):** the 20 creature backs stay on the battlefield (they
>   died on entry); back-face subtypes no longer count; land / planeswalker backs are no longer lands / planeswalkers; a back
>   face's Equip or Aura attach does nothing.
> · ⚠️ Found, not fixed (queued): **keywords bleed the same way** — `keywords.hasKeyword` reads Scryfall's combined `keywords`
>   array, then scans the combined ORACLE (so stripping the array is not enough), and 116 transform / flip / adventure front faces
>   have a back face's combat keyword (Lunarch Veteran, Devoted Grafkeeper and Overwhelmed Archivist fly; Ravenous Demon flies and
>   tramples; a land-dropped Westvale Abbey reports Ormendahl's flying, lifelink, indestructible and haste through
>   `permanentHasKeyword`). Not folded in: `hasKeyword` is read off the card by many readers that bypass the derive, and the
>   leaked haste is what lets Westvale Abbey tap the turn it is played today (the summoning-sick stamp reads the printed combined
>   line — Hostile Hostel, with no leak, can't); the mana lane ("Stop DFC front faces reading land-face mana") fixes the sickness
>   side on top of this derive, and the keyword read lands with or after it; **the back face's abilities
>   on the combined oracle** are still read as the front face's (Halvar's Equip is still offered — it now does nothing); **printed readers of the combined
>   line**: `triggers.isCreaturePerm` → `gameState.lastKnownIsCreature` (Soul Warden gains 1 life when Westvale Abbey enters —
>   probed; the 10-02 queue item), the Equipment / Aura target pools (`equipmentYouControl`, `auraOrEquipmentYouControl` offer
>   Halvar and Dorothea), `applyAttachToSelf` (Captain America's Catch) has no Equip guard, sba's "Enchant land" host read;
>   `countForSpec`'s `cardsInGraveyard` reads a double-faced card's combined line (CR 712.8a — a split card's is right, 709.4c).

> ## 🔧 2026-10-16 — FIX: the mulligan policy reads a {2/X} hybrid pip as 2 when a card carries only its cost (CR 202.3f) · **±0**
> Suite **18,985** green (1 skipped; 1,780 files) under the gate lock, on this commit's tree stacked on the citations
> commit below (which it also covers). Lint 0. **Mutant 1/1** killed (the old every-pip-is-1 rule bottoms Hill Giant
> instead of Flame Javelin), restored byte-identical (sha1).
> · `manaValueFromCost`, the fallback when a card has no finite cmc, counted every non-numeric pip as 1, so Flame Javelin
>   ({2/R}{2/R}{2/R}, MV 6) read as a castable 3-drop. A pip that leads with "N/" now counts N; colored, two-color hybrid
>   and Phyrexian pips stay 1 — tutorManaValue's rule. Cards built through the server card index carry a cmc
>   (`cmc: card.cmc ?? 0`), so only hand-built cards reach the fallback.
> · Not changed, same arithmetic, same no-cmc reach: goldfish.js `manaValueFromCost`, library.js `manaValueOfCard` (clash).

> ## 📚 2026-10-16 — CITATIONS (docs only): real rules cited for the wrong mechanic — 176 one-line edits · **±0**
> Comments and test titles only: of the 67 changed source files, 56 are token-identical to their parent (espree tokens,
> comments excluded) and 11 are test files whose only token change is a describe/it title. Lint 0; the citation check
> reads 9,931 citations, 0 name no rule. Suite: run once on the stacked tree with the next entry's commit (see there).
> · **The queued families from the entry below, swept file-wide** (each new number read in cr_current.json): tribute
>   702.96/a (Overload) → 702.104/a ×11 · scavenge 702.96 → 702.97 · dethrone 702.104a (Tribute) → 702.105a ×5 · emerge
>   702.97/a (Scavenge) → 702.119/a ×12, dropped ×2 ("Emerge cards are creatures": no rule says so) · search
>   701.19/a/b/c (Regenerate) → 701.23/a/b/g ×15, 608.2c where the claim is "the destination is whatever the card
>   says" ×4 · monstrosity 701.32/a/b/c (Set in Motion) → 701.37/a/b ×9 · die
>   rolls 726.2–726.4 (the initiative) → 706.1a/b · evolve's comparison 702.100d (multiple instances) → 702.100a + 603.4
>   ×5 · layer-7 reads 613.3 (layers 2–6) → 613.4/613.4c ×9, 613.1g ×2 · suspend's upkeep tick 702.62d → 702.62a ×2 ·
>   summoning sickness 702.10c (haste) → 302.6 ×15 · "X bound at cast" 202.3b (DFC back faces) → 107.3a ×10 · the
>   adventurer's creature half 715.2b → 715.3/715.4 ×6 · 601.3e as a generic permission → 601.3b (flash grants) ×10,
>   305.2a (the land-play count) ×4, 601.3 (cast permission) ×6; kept where the permission is type-filtered (its own
>   examples are Garruk's Horde and Melek) ×3; equip's target 702.6e (Equip planeswalker) → 702.6a ×3.
> · **Same wrong numbers, more mechanics:** ingest 701.19a → 702.115a ×4 · shuffle 701.19/701.19e → 701.24a ×2 ·
>   populate 701.32a → 701.36a ×4 · equip "sorcery speed" 702.6b → 702.6a ×2 · 202.3b for "MV is the printed cost" →
>   202.3, 202.3e (X on/off the stack), 118.9c (an alternative cost), 118.8d (an additional cost: commander tax, Toxic
>   Deluge) ×15 · 118.6 (unpayable cost) as the play-from-zone permission → 116.2a (a land played "from the zone it was
>   in") / 601.3 ×13, dropped ×2 (a filter's word list is a union: no rule says so) · "CR 720" (Omen cards) for gain
>   control → 613.1b · the 702.100a/f shorthand (there is no 702.100f) → 702.100a.
> · ⚠️ **Found, not fixed (code, not comments):** the kicked cast action's `cmc` is printed + kicker and the bestowed
>   cast's is the bestow cost; both comments cite 202.3b for it, and CR 118.8d / 118.9c say additional and alternative costs
>   don't change mana value. The field feeds opponentAI's scoring; whether it reaches a spell's MV on the stack is
>   unverified. Left as written for a code slice. ⚠️ A keyword-vs-section scan ("AFFLICT (CR 702.131)" where 702.131 is
>   Ascend) finds ~180 more off-by-N citations across ~50 keywords — too many to gate in this slice; queued.

> ## 🔧 2026-10-16 — FIX: a mandatory trigger whose only legal targets are on the wrong side still takes one (CR 603.3d) — Man-o'-War returns itself · **+0** · corpus 15,492
> Suite **19,001** green (1 skipped) / 1,780 files on the tree rebased onto 4463487c (18,968 / 1,777 on c1f630ab before the
> rebase). Flip-diff **0 / 0 / 0**. **Mutants 24/24** on assertions, restore byte-identical. 48 seeded July-list games
> **byte-identical** to c1f630ab (`a1a9f98e68c3b6c3` / `fdbb728c27d644a7`, both reproduced on a pristine c1f630ab archive first); on
> the rebased tree the same 48 games log 0 forced / 0 declined. Lint 0; citations 117 (baseline). Top 1,000 904 · top 2,500 1,743
> (unchanged by this slice). Banked on shelf D18 (2026-09-30).
> · **The bug.** Man-o'-War with no other creature on the battlefield never bounced itself, either seat. The trigger DID go on the
>   stack, as the Arbiter no-op: the α1 chooser found no opponent's creature, answered `NO_SAFE_TARGET`, and `buildTriggerStack`
>   gave it the `manual` payload, which resolves as nothing and logs a bare `stack-resolve` (D18's "stack-resolve" was this, not
>   the creature spell). A card classified `native-trigger` lost its whole ability with no reason logged. The enumeration was
>   right all along — a creature is a legal target for its own "target creature"; the chooser's refusal was the drop.
> · **The rule.** CR 603.3d removes a triggered ability only when no legal choice can be made. `pickForcedTriggerCandidate`
>   (gameEngine.js): when no candidate puts every target on its atom's side, a MANDATORY ability takes the least harmful one — a
>   wrong-side permanent costs its mana value, then power (behind `usePolicyEval`, `permanentValue`), a spell or graveyard card
>   its mana value, an ability on the stack or a player nothing; damage that could kill a wrong-side player (a fixed amount ≥ their
>   life, or an amount that isn't fixed) ranks last; ties keep enumeration order. NOT forced — the Arbiter no-op stays — for
>   "choose up to one" (choosing none removes it, as before), an optional chosen target ("you may", or an `optional-*` payment
>   around the payoff: its controller declines, CR 603.5), or a side that can't be read. `flushTriggers` logs
>   `trigger-target-forced` / `trigger-no-safe-target`: neither case is silent. All three branches (intervening-if, non-modal,
>   modal) carry it. CR cites in the touched code corrected 603.3c → 603.3d where they meant targets / no-target removal.
> · **The human path.** There is no separate human target prompt for a triggered ability — `chooseTriggerTargets` targets for both
>   seats at the flush. Witnessed through the session driver: the human casts Man-o'-War, no target decision is raised, and it
>   returns to the human's hand. The human's only trigger decision is the "may" prompt, which an optional wrong-side trigger never
>   reaches (declined for them, now logged).
> · Witness `forcedTriggerTarget.test.js` (24, real fixtures; cast + resolved through the engine): Man-o'-War both seats, the
>   Giant control, the lower-MV pick (Bears), the power and tie-order rules (Centaur Courser, Gray Ogre), Mystic Snake countering
>   the cheaper own spell, Flametongue Kavu, Nekrataal, Sparkmage Apprentice behind Leyline of Sanctity at 20 and 1 life, Murderous
>   Redcap (twice, through persist), Bloodhall Priest (intervening-if), Duergar Hedge-Mage + its control, Separatist Voidmage + its
>   control, Equilibrium (optional payment), Return to Nature's modes as a flushed trigger (forced + ambiguous-only), the session
>   driver, and three chooser-level price units. Five tests that pinned the old no-op now pin the rule (`enemyTriggerChooser`,
>   `flushTargetChooser` — Mystic Snake's counter, `triggerChooserInvalidSeat`, `boardEval` — the forced pick under the evaluator,
>   `flickerwisp` — the mandatory blink of an opponent's Mind Stone); the first three sit beside an optional twin that keeps
>   `NO_SAFE_TARGET`.
> · **Blast radius (runtime probe: every native-trigger permanent's targeted trigger, flushed with its source alone on the
>   battlefield).** Pristine tree: 107 of 1,167 descriptors went to the Arbiter no-op. Now: **64 forced (62 cards)** + **43
>   declined and logged** + 0 other — the control balances. Forced, by play rank: Ulamog, the Infinite Gyre (cast), Venser, Shaper
>   Savant, Tidespout Tyrant, Angel of Despair, Awaken the Honored Dead, Skinrender, Ashen Rider, Man-o'-War, Network Disruptor,
>   Spitebellows, Aethersnipe, Aether Adept, Flametongue Kavu, Mist Raven, … Declined: Aura Shards, Brinelin, Necropede,
>   Surgespanner, Frenzied Goblin, … (all optional).
> · **Results (flag to Omnath).** The 48 seeds never reach the case — read from the games' own logs: 0 forced, 0 declined, on
>   both trees. Positive control: the same read finds the flush's other lines in these games (`trigger-condition-not-met` ×10,
>   `trigger-removed-no-target` ×1 in the 8-seed set; each log complete, turn 1 to the last), so the zero is a measurement. It
>   matches the byte-identical trajectories. No action-set change. An OUTCOME change wherever the board occurs (an
>   enters trigger like Man-o'-War's with no correct-side target, Mystic Snake over its own spell), so whether it moves the epoch cut
>   is Omnath's call; nothing in the July seeds is affected.
> · ⚠️ Found, not fixed (queued): (1) the AI's cast picker (`opponentAI.pickCastAction`) never reads a permanent's enters trigger,
>   so it can now cast Man-o'-War onto a board with no enemy creature and bounce its own, or flash in Mystic Snake over its own
>   spell and counter it — the bug used to hide this; a cast-time hold for a mandatory trigger with no correct-side target is the
>   next slice (an AI change: needs its own A/B). (2) Forced-pick refinements: a forced tap could prefer an already-tapped
>   permanent (Network Disruptor), a forced −X/−X or damage a creature that survives it (Festering Goblin), and a forced bounce
>   treats a token as cheapest though bouncing it loses it; a damage amount that isn't printed is read as possibly lethal, so
>   Murderous Redcap pings itself rather than its controller at 20 life. (3) An optional wrong-side trigger is declined for a human
>   too — offering them the "may" needs the prompt to show the target.

> ## 🛡️ 2026-10-16 — GUARD: the closed targetType vocabulary — the classifier and the trigger flush can no longer disagree on a target slot · **±0** · corpus 15,492
> Suite **1,781 files / 18,989** green on 4463487c (1 pre-existing skip; first gated on c1f630ab, 1,778 / 18,956, then
> rebased and re-gated). Flip-diff **0 / 0 / 0** (34,620 cards) and program fingerprint **byte-identical** on both bases.
> **Mutants 10/10**, every one killed on assertions; every restore byte-identical (sha256).
> · **The trap.** A referent targetType (a recipient synthesized from the trigger's context: `defendingPlayer`,
>   `damagedPlayer`, `discardingPlayer`, `attackedDefender`) had to be listed in `NON_CHOSEN_TARGET_TYPES` by hand. Missing
>   there, it read as a chosen target the enumerator had no pool for: coverage credited the card native (`deal-damage` is
>   enemy-side, so it read as resolvable) while the flush found no candidates, logged `trigger-removed-no-target` and dealt
>   nothing. Three times (`eachOpponentCreature`, `discardingPlayer`, `attackedDefender`), and the stage ③ · 25 mutant left
>   the classification test green.
> · **The guard — option 1, placed at the parser's validity gate.** `targetTypes.js` gains `CHOSEN_TARGET_TYPES`, the 47
>   pools `spellEffects.enumerateTargets` dispatches (19 direct branches plus the 28 `PERMANENT_PREDICATES` keys),
>   partitioned against `NON_CHOSEN_TARGET_TYPES` at load. `programConfidence` reads a program LOW when a target slot names a
>   type in neither set. The slots are an atom's `targetType` and a two-target atom's `secondaryTargetType`, read through
>   `targetingAtomOf`, which moved to `programQueries.js` so the enumerator and the gate read one definition. Every consumer
>   re-asks `programConfidence` (`triggerRoutesNatively`, `buildTriggerStack`, the spell, activated and loyalty lanes, the
>   cast and activation offers, `runEffectProgram`), so for such an atom they agree by construction: the Arbiter.
> · **Options 2 and 3, not taken.** The corpus sweep (2) is a tautology once the gate exists, and it needs the gitignored
>   corpus (hollow in CI). The resolver registry (3) covers `deal-damage` only. The probe says `deal-damage` is the only op
>   carrying a referent targetType today, but the gate also covers every op and every path, and the matchers that take a
>   targetType from a regex capture.
> · **Scope, measured** (drift probe, 34,620 cards). 8,150 natively routed triggers, 55 targetTypes, zero chosen slots
>   without a pool. The full parse surface (spell, triggers, activated, loyalty, nested payoffs) names 60 targetTypes, none
>   unknown. **Probe positive control:** HEAD with `attackedDefender` unregistered → 5 holes, each credited `native-trigger`
>   while the flush could not reach it: Hellrider, Scorch Spitter, Rakdos Roustabout, Raid Bombardment, Cavalcade of
>   Calamity.
> · **Seen to fail.** `attackedDefender` removed from `NON_CHOSEN_TARGET_TYPES` (a real edit, guard in place): 8 assertion
>   failures, no load error. The guard's referent row reads `attackedDefender: UNREGISTERED · low · routes false ·
>   body-only`, and `attackedDefenderDamage`'s "flip native" goes red (`expected 'body-only' to match /^native-/`). The same
>   mutant on HEAD: 4 runtime reds and the classification test GREEN — the blind spot, reproduced. Restored byte-identical.
> · Witnesses (+13): `targetTypeVocabulary.test.js` (9) — every chosen type offered a target through `expandCastChoices` on
>   a full board, while an unregistered type gets nothing on the same board (vacuity control); the gate on each slot shape
>   (own, secondary, one modal mode, an optional payment's payoff); the four live referent families on real oracle.
>   `referentRegistrationTrap.test.js` (4) — `vi.mock` unregisters `attackedDefender`: the classifier refuses Hellrider,
>   the flush routes it `manual` (not removed), and Falkenrath Perforator (`defendingPlayer`) is the control — native,
>   effect program, 1 damage. Red 3 of 4 on HEAD (`classifier [true, true]`, `flush []`).
> · ⚠️ Not covered: the mirror hazard — a type IN `NON_CHOSEN_TARGET_TYPES` whose op's resolver has no arm for it
>   (classified native, resolves with no recipient). That is per-op resolver coverage, its own slice.
> · CHANGELOG: none — no card, tier or game changes.

> ## 🙋 2026-10-16 — FEAT: a person chooses what their Aura enchants as it enters without being cast (CR 303.4f) — the `aura-entry-host` pause · **±0** · corpus 15,494
> Suite **19,081** green (1 skipped) / 1,788 files (+3). Lint 0. Flip-diff **0 / 0 / 0** (vs e708140a). **Mutants 22/22**, restore
> byte-identical. AI path: 40 seeded Expert games on e708140a vs this change — final states, logs and per-decision trajectories
> **identical** (332 non-cast Aura entries across 33 of the games, none asked). Live in npm run dev — see below.
> · **Builds on e708140a** — cool-easley's Aura re-entry slice (7af4f621), then ecstatic-jang's seven Aura lifts (c63c7925..e708140a).
>   Cherry-pick those first, in that order.
> · **Who is asked:** `state.humanSeats` — `createLearnSession` stamps `["user"]` below Expert, the seat the driver pauses for.
>   Expert and self-play never carry it, so every seat the AI plays runs the identical path (the witnesses deep-equal it).
> · **No entry site pauses.** Every real entry decides its host through `auraEntry.enteringAuraHost` — `enterCardFromZone`, the
>   lifts' token copy and clone (both swapped from `chooseAuraEntryHost`; the flicker gain's simulation keeps the pure chooser): a
>   person's Aura with two or more legal hosts, inside an ask, records the question and lets the step finish on the house pick. A
>   doubled token copy asks once per copy (keyed by source + index — the copiable values carry no id). The ask — every atom
>   `runEffectProgram` resolves (`resolveAtomAsking`: its loop and the optional settle) and the settles that enter a card
>   (`learnSession.settleAskingAuraHost`: tutor, dig, milled pick, clone) — throws that run away, pauses on the state the step began
>   from, and `runProgram.resolveAuraEntryHostChoice` re-runs the step with the answer. Exact because the engine is: ids from
>   `state.idSeq`, shuffles from `state.rngSeed`, an entry that never mutates its input (the dig and tutor witnesses compare the
>   library order with the house run's).
> · **One event (Brago, Replenish):** the candidates come off `replacementState` — never a permanent returning with the Aura;
>   several of a person's Auras are asked in turn, answers carried, then the event happens once.
> · **Contract:** `aura-entry-host` in PENDING_CHOICE_KINDS (pendingChoiceKinds fixture: settles in one tick on the AI path);
>   PLAY_API_VERSION **1.3.0** (additive MINOR — PLAY-API-CONTRACT §1.1a row; the COMMS post rides the ship). The wire carries kind,
>   controller, cardName, sourceName, candidates — the re-run step never crosses it.
> · **UI:** AuraEntryHostPanel (one button per host, no decline), `useLearnSession.applyAuraEntryHostChoice`, the LearnView sheet
>   and router. `settleCloneChoice` gains the pendingChoice guard the other settles have.
> · **Save schema v6 (CONTRACT-MIG):** `state.humanSeats` is durable, so v5→v6 backfills it from the session's own difficulty (a
>   pre-v6 beginner game resumes still asking its player; Expert stays without; an existing field is kept). The bump exposed a
>   latent puzzle-picker bug: `puzzleStore`'s index judged `resumable` on the RAW doc, so every saved puzzle would have greyed out
>   though `getPuzzle` migrates and loads it — it now judges the migrated doc, as learnSaveStore's index already did (seen to fail
>   without it).
> · **Live (npm run dev, port 3417, temporary route + page, deleted after):** a beginner session parked on the question through the
>   real enrichment (`enrichDeck`), the real wire view and the real panel in LearnView's sheet; the real `/api/learn/choose` with
>   the hook's payload put Pacifism on the opponent's Bears (200, next decision `ask`, no server errors). It caught the glass
>   choice buttons rendering black text on the black glass with no hover — a `<button>` doesn't inherit the text colour — in this
>   panel and, shipped, the change-the-target and milled-pick panels: all three now carry `--ley-text` + `.ley-card`.
> · **Witnesses:** auraEntryHostChoice.test.js (23) — Displacer Kitten, Brago's one event, two Auras in one event, Sun Titan's "you
>   may" then the host, Academy Rector through the session's tutor settle, Replenish's two Auras, Flash Photography doubled by
>   Doubling Season (one question per copy), Copy Enchantment through the session's clone settle, a save mid-question, the
>   session driver / wire / hook payload, a pilot's offer, the AI path byte-identical; the dig settle on a built pause (no dig puts
>   an Aura onto the battlefield yet). auraEntryHostPanel.test.jsx (3), glassChoiceButtons.test.jsx (3), the v5→v6 migration, the
>   puzzle picker.
> · **Flagged, not built (task chips):** the Academy board shows no attachments (boardSnapshot carries none, LearnBoard renders
>   none — after any Aura resolves the player can't see its host); PENDING_CHOICE_KINDS omits four kinds the driver handles
>   (optional-life-payment, sylvan-library, tainted-pact, tempting-offer).
> · **Still the house pick for a person:** a resolver called outside an atom (an Arbiter verdict — it can't pause) and The
>   Ur-Dragon's hand put (its card is picked by heuristic too). A new road onto the battlefield needs nothing beyond deciding its
>   host through `enterCardFromZone` / `enteringAuraHost` inside an atom or one of those settles (ENGINE-SCAFFOLD §4.5).

> ## 🌿 2026-10-16 — FEAT: a clone may copy an Aura — the copy chooses what it enchants (CR 303.4f), or the spell goes to the graveyard (CR 303.4g) · **±0** · corpus 15,494
> Suite **19,049** green (1 skipped) / 1,785 files. Lint 0. Flip-diff **0 / 0 / 0**. **Mutants 7/7**, restore byte-identical. CR citations: no new dead cite.
> Coverage unchanged (top 1,000 904 · top 2,500 1,743).
> · **The withholding lifted:** `cloneCopy.cloneWidenedCopiable` (Copy Enchantment's "any enchantment", Clever Impersonator's
>   "any nonland permanent", Sakashima's Protege's entered-this-turn pool) never offered an Aura. A copy entering as an Aura is
>   not resolving as an Aura spell, so CR 303.4f applies: `resolvers.resolveCloneChoice` chooses the host just before it enters
>   (the bundled Copy Enchantment ruling) and enters it attached (`enterPermanent`'s `attachTo`). With nothing it may enchant, the
>   clone — a resolving spell — goes to its owner's graveyard (CR 303.4g: "unless that zone is the stack"), logged `aura-stays`.
>   An Aura is copiable when its Enchant line is one the engine lists (`auraEntryHostSpec`, now imported by cloneCopy — it
>   reaches no clone module); the Saga exclusion stands (CR 714.3a).
> · **The offer:** the PERMANENT_ETB pause lists an Aura only when its COPY (the clone's riders applied) would have a host on the
>   board the clone enters (`cloneCandidateEnters`); a pick from outside the offer is refused at the settle (the clone enters as
>   itself), as before.
> · Graduated: `cloneWidened.test.js` (both pools and both pauses gain the Pacifism; "a wrong pick (the Aura) is refused" → the
>   copy becomes a Pacifism on the opponent's Bear) and `sakashimasProtege.test.js` (the pool and the witness gain the Pacifism).
>   Both boards' Pacifism is attached to a creature now: an unattached Aura is put into the graveyard by the next state-based check
>   (CR 704.5m, the re-entry slice), so it vanished mid-cast and the stale pick entered the clone as itself.
> · Witness `copyEnchantmentAura.test.js` (7): the tiers; the offer (Pacifism and Ghostly Prison, never the Saga or the Curse);
>   copying the opponent's Control Magic takes your Craw Wurm back; a stale pick with no host sends Copy Enchantment to the
>   graveyard; a pick of the Curse from outside the offer is refused; the Cartouche whose copy has no host is not offered;
>   Clever Impersonator's Rancor copy (an Aura, not a creature) on your best creature.

> ## 🌿 2026-10-16 — FEAT: a detained Aura returns attached under its owner's control (CR 610.3c, 303.4f) · the CR 610.3d simultaneity guard · **±0** · corpus 15,494
> Suite **19,042** green (1 skipped) / 1,784 files. Lint 0. Flip-diff **0 / 0 / 0**. **Mutants 9/9**, restore byte-identical. CR citations: no new dead cite.
> Coverage unchanged (top 1,000 904 · top 2,500 1,743).
> · **The withholding lifted:** the detain frame (`removal.js` — Banishing Light, and Oblivion Ring's two-trigger printing folded
>   onto it) excluded `typeNeg aura` at enumeration. The return (`zones.applyDetainReturn` → `enterCardFromZone`) brings an Aura
>   back under its owner's control (CR 610.3c) choosing what it enchants (CR 303.4f — the owner chooses, the bundled Oblivion Ring
>   ruling), or leaves it exiled forever with nothing to enchant (CR 303.4g, the same ruling). `auraEntryModeled` keeps a Curse out.
>   The note's old citation "CR 611.3c" (static effects as a permanent enters) is corrected to 610.3c.
> · **CR 610.3d:** every return one leave event sets off is simultaneous, but the engine runs each detainer's return as its own
>   trigger, so a card another detainer returned is already on the battlefield when a later return runs — and an Aura can't enter
>   attached to a permanent entering at the same time. `gameState.recordLeaveEvent` records the battlefield as the detainer leaves
>   (`boardIds`), `triggers.checkLeavesTriggers` threads it (`detainBoardIds`), and the return passes it as the host option
>   `presentIds` (`auraEntry.auraEntryHosts`). Permanent ids, not timestamps: tokens are minted without one. For the folded
>   two-trigger printing the returns really are separate triggers, so this can miss a legal host there (a false negative), never
>   add one. An older save's trigger carries no list and chooses on the board as it is.
> · **The side it left:** the link records an exiled Aura's side (`auraSideHint`) for an Aura whose side the policy can't read.
> · Graduated: `detainExile.test.js`'s parse pin and its "an opposing AURA is never offered" runtime pin (the Light now takes the
>   Pacifism off your bear).
> · Witness `auraDetainReturn.test.js` (8): the restrictions and tiers; the pool (never the Curse); Banishing Light takes the
>   opponent's Pacifism off your Bears and, leaving, returns it under its owner's control onto your Craw Wurm; your Curiosity
>   returns to the opponent's Giant (the link's side); the Oblivion Ring ruling (nothing to enchant → stays exiled); two Lights
>   leaving together in either order — the Rancor never takes the Wurm returning with it; the control — the second Light leaving
>   later lets it.

> ## 🌿 2026-10-16 — FEAT: Flickerwisp's end-step return brings an Aura back attached (CR 303.4f) · **±0** · corpus 15,494
> Suite **19,034** green (1 skipped) / 1,783 files. Lint 0. Flip-diff **0 / 0 / 0**. **Mutants 7/7**, restore byte-identical. CR citations: no new dead cite.
> Coverage unchanged (top 1,000 904 · top 2,500 1,743).
> · **The withholding lifted:** the delayed blink on the permanent pool (`templateMatchers.matchDelayedBlink` — Flickerwisp,
>   Glimmerpoint Stag) excluded `typeNeg aura`. The return (`zones.applyBlinkReturn` → `enterCardFromZone`) chooses what the Aura
>   enchants under its owner's control, or leaves it exiled with nothing to enchant (CR 303.4g), so the pool admits an Aura —
>   `auraEntryModeled` keeps a Curse out. The bundled Flickerwisp ruling: the return happens even when Flickerwisp is gone.
> · **The side it left:** `applyDelayedBlink` carries an exiled Aura's side ("own" when its host's controller is its owner, else
>   "enemy") as an optional last token of the `[blink-return …]` sentinel; `blinkReturnClauseParser` reads it (a sentinel without
>   one — an unattached card, an older save — reads as before) and the return passes it as `auraSideHint`, the house policy's
>   tiebreak for an Aura whose side it can't read (the immediate blink already does).
> · Graduated: `flickerwisp.test.js`'s parse pin (`typeNeg aura` → `auraEntryModeled`) and pool pin (the Pacifism joins).
> · Witness: `flickerwisp.test.js` +4 — the pool (never the Curse); the opponent's Pacifism, flickered off their Bears, returns
>   at the end step under its owner's control onto YOUR Craw Wurm, a new object; with every creature gone it stays exiled; your
>   Curiosity flickered off the opponent's Hill Giant returns to THEIR Giant (the sentinel's side).

> ## 🌿 2026-10-16 — FEAT: a token copy of an Aura chooses what it enchants as it is created (CR 303.4f/g) — Flash Photography, Caretaker's Talent · the Role guard · **±0** · corpus 15,494
> Suite **19,030** green (1 skipped) / 1,783 files. Lint 0. Flip-diff **0 / 0 / 0**. **Mutants 8/8**, restore byte-identical. CR citations: no new dead cite.
> Coverage unchanged (top 1,000 904 · top 2,500 1,743).
> · **The withholding lifted:** both token-copy targets (`tokenCopy.js` — Flash Photography's "target permanent", Caretaker's
>   Talent's "target token you control") excluded `typeNeg aura`: a token is created, not put onto the battlefield from a zone, so
>   it never reached the non-cast entry's Aura choice. The exclusion becomes `auraEntryModeled` (a Curse stays out) and
>   `tokens.applyCreateTokenCopy` chooses the host at creation, on the board as the creation began, attaching through
>   `attachPermanent` before any enters trigger (a copied Control Magic takes its creature). With nothing to enchant, "If the Aura
>   is a token, it isn't created" (CR 303.4g) — logged `aura-token-not-created`. The Saga exclusion stands (CR 714.3a).
> · **The Role guard (CR 303.7a / 704.5y):** sba.js does not run 704.5y, so `auraEntry.auraEntryHosts` never lets a Role choose a
>   permanent already carrying a Role of its controller, and a doubled Role copy (Doubling Season) passes `excludeIds` so two
>   copies of one event never share a host. Found on the way, NOT fixed here (flagged as its own task): the cast-side Role
>   resolver under Doubling Season puts two Monster Roles on one creature and both stay.
> · Graduated: `copyFamilyKn3.test.js` (Flash Photography's restrictions; the target pool gains the Pacifism) and
>   `classLevels.test.js` (Caretaker's Talent may copy a Mask token now — its copy enters attached; the token Saga stays out).
> · Witness `auraTokenCopy.test.js` (9): the restrictions and tiers; the offer (the opponent's Pacifism and your Rancor, never
>   their Curse or your Saga); the opponent's Pacifism copied goes on THEIR Hill Giant and survives the state-based check; your
>   Rancor's copy on your best creature; a Cartouche copy with no creature of yours is never created and its draw never
>   triggers (and the control where it is); the Role copy avoids the Wurm's Role; Doubling Season's two Role copies on two
>   creatures, or one copy when only one creature is free.

> ## 🌿 2026-10-16 — FEAT: Mole Module's milled pick offers an Aura with something to enchant · **±0** · corpus 15,494
> Suite **19,021** green (1 skipped) / 1,782 files. Lint 0. Flip-diff **0 / 0 / 0**. **Mutants 3/3**, restore byte-identical. CR citations: no new dead cite.
> Coverage unchanged (top 1,000 904 · top 2,500 1,743).
> · **The withholding lifted:** `library.applyPickMilledToHand`'s battlefield destination (Mole Module: "mill four cards. You may put
>   a permanent card from among them onto the battlefield.") never offered an Aura. It offers one now when it has something to
>   enchant (`auraEntry.auraEntryHasHost`): the pick enters through `enterCardFromZone`, which chooses the host (CR 303.4f). One
>   with nothing to enchant would stay in the graveyard (CR 303.4g) and is not offered. One candidate still enters directly; two or
>   more still pause (`runProgram.resolveMilledPickChoice` enters the pick the same way).
> · Graduated: `moleModule.test.js`'s "the Aura withheld" pin keeps its outcome on its own board — no creature, so nothing to
>   enchant — and its comment now says why.
> · Witness: `moleModule.test.js` +4 with real fixtures — the offer holds Rancor, Pacifism and the Forest (never the instant);
>   Rancor picked enters on your Grizzly Bears; Pacifism on the opponent's Craw Wurm; a lone Aura candidate enters directly,
>   attached; with no creature anywhere neither Aura is offered and the Forest enters alone.

> ## 🌿 2026-10-16 — FEAT: the battlefield search finds enchantments — Academy Rector · an Aura found enters attached · **+1** · corpus 15,494
> Suite **19,017** green (1 skipped) / 1,782 files. Lint 0. Flip-diff **1 / 0 / 0**. **Mutants 5/5**, restore byte-identical. CR citations: no new dead cite.
> Coverage top 1,000 904 · top 2,500 1,743 (unchanged — Academy Rector ranks below both).
> · **The withholding lifted:** the uncapped "search your library for an enchantment card, put it onto the battlefield" (bfm in
>   `library.js`) was held out of the admission list because a found Aura would have entered attached to nothing. A fifth arm,
>   GUARANTEED-ENCHANTMENT, joins land / creature / planeswalker / the bare permanent card; the found card enters through
>   `enterCardFromZone`, which chooses what an Aura enchants (CR 303.4f) or leaves it in the library (CR 303.4g). Carriers:
>   Academy Rector, Lost Auramancers, Enduring Ideal (still parked on Epic). No uncapped "Aura card" carrier exists, so the arm
>   admits the word "enchantment" only.
> · **The offer:** `applyTutor` drops, for a battlefield search only, an Aura with nothing it may enchant (or an Enchant line the
>   engine can't list) — choosing it would put nothing onto the battlefield, the same as finding nothing (CR 701.23b allows it), and
>   it kept the auto-pick's highest mana value off a card that stays behind. The MV-capped arm (Zur the Enchanter) gets the same
>   offer. `auraEntry.auraEntryHasHost` is the shared read.
> · Graduated: `arenaRector.test.js`'s "the ENCHANTMENT battlefield fetch stays low; Academy Rector parks" → admitted / native.
> · Witness `academyRector.test.js` (5): the parse and tiers; through the real dies → pay → search: the offer (never Wild
>   Growth with no land, the Curse or Animate Dead); Pacifism found enters on the opponent's Craw Wurm; Ghostly Prison enters as
>   itself; with no creature anywhere Control Magic is not offered and the auto-pick takes Ghostly Prison.

> ## 🌿 2026-10-16 — FEAT: the mass return brings Aura cards back attached (Replenish, Resurgent Belief) · Retether · **+1** · corpus 15,493
> Suite **19,013**: 19,008 green, 1 skipped, and the 4 rules-retrieval POST tests, which fail in a fresh worktree without the
> built `app/data/rules-index.json` (CI builds it before testing) and pass, 8/8, once it is built — every later slice's suite ran
> with it, all green. Lint 0. Flip-diff **1 / 0 / 0**. **Mutants 8/8**, restore byte-identical. CR citations: no new dead cite
> (117 before and after, all pre-existing). Coverage: top 1,000 904 · top 2,500 1,743 (unchanged — Retether ranks below both).
> Built on 0b074c66 (the Aura re-entry slice).
> · **The withholding lifted:** `zones.applyMassReanimate` skipped every Aura card — the mass return had no way to choose what an
>   Aura enchants (CR 303.4f). Each Aura card now returns through the shared entry and chooses its host on the board as the return
>   began (`auraEntry.chooseAuraEntryHost` reads the one-event `replacementState`): never an enchantment returning with it (the
>   bundled Replenish ruling — "Auras can only be placed on permanents that were on the battlefield before this effect started to
>   resolve"), onto an opponent's permanent when nothing else is legal ("You must return Auras if possible"), and with nothing it
>   may enchant it stays in the graveyard (CR 303.4g, logged `aura-stays`).
> · **One event (CR 603.6a):** the return goes through `enterCardsTogether` — every card is placed before any enters trigger is
>   checked, so a returning Eidolon of Blossoms draws for each enchantment returning with it, whatever the graveyard order. It used
>   to enter card by card, and a later watcher never saw an earlier card.
> · **Retether** ("Return each Aura card from your graveyard to the battlefield. Only creatures can be enchanted this way."): a
>   whole-oracle matcher (`templateMatchers.matchAuraReturnCreaturesOnly`) → the mass return over `{ subtype: "Aura" }` with the
>   host limit `auraHostOpts: { onlyCreatures: true }`, which `auraEntry.auraEntryHosts` takes as its first host option (layer-aware:
>   the bundled ruling's animated land qualifies). `enterCardFromZone` passes `auraHostOpts` through. The first sentence alone parks.
> · Graduated: `massReanimate.test.js`'s "⛔ SKIPS AURA CARDS" pin → its CR 303.4g half (no creature: Pacifism stays, logged).
> · Witness `auraMassReturn.test.js` (10): Pacifism onto the opponent's biggest creature; the Replenish ruling (a 6/7 Nyxborn
>   Colossus returning AHEAD of Rancor is never its host — seen to fail on a live-board choice); the must-return ruling; CR 303.4g;
>   the three Eidolon triggers; Retether's creatures-only and the Dryad Arbor ruling; Replenish's unlimited Wild Growth.

> ## 🪢 2026-10-16 — FIX: an Aura that enters without being cast chooses what it enchants (CR 303.4f/g) · an Aura attached to nothing goes to the graveyard (CR 704.5m) · **±0** · corpus 15,492
> Suite **19,002** green (1 skipped) / 1,780 files (+26). Lint 0. Flip-diff **0 / 0 / 0**. **Mutants 35/35**, restore byte-identical.
> Coverage unchanged (top 1,000 904 · top 2,500 1,743). The 48-game replay (integration gate, batch 3): byte-identical.
> · **The bug (found at shelf D21, chip task_149886ba):** `zones.enterCardFromZone` — the one non-cast entry (blink, reanimation,
>   library and hand puts) — had no Aura handling: a blinked Pacifism came back attached to nothing, and the CR 704.5m sweep read
>   only attached Auras, so it stayed. The reported probe reproduced it before the fix.
> · **The entry (CR 303.4f/g):** `auraEntry.js` (new leaf) lists the legal hosts — `staticAbilityParser.auraEntryHostSpec` (the cast
>   host spec plus land / land you control / Forest / permanent), layer-aware types, the Enchant restrictions, protection (CR
>   702.16c; an unread quality — everything, enchantments, the chosen colour — fails closed), "can't be enchanted"; nothing is
>   targeted (the bundled Brago ruling: hexproof doesn't matter). The house policy, every seat: the cast side's `auraCastIntent`
>   (moved from opponentAI) — a harmful Aura on an opponent's highest-power creature, a helpful one on its controller's, a mana
>   Aura on the land carrying the most; an unread side goes back to the side it left on a blink, else its controller's (two in
>   three of the 833 placeable Auras the reader can't side help their host). No legal host, or an Enchant line it can't list (a
>   Curse, Animate Dead) → it stays in its zone (`entered: false`, logged `aura-stays`). `attachTo` for an effect that names the host
>   (Dragon Fangs, Mantle of the Ancients — their post-entry attach moved into the entry, so it attaches before triggers).
> · **The blink:** every target exiled first (an attached target before its host), then all returned as ONE event
>   (`enterCardsTogether`) — "The Aura can't enter the battlefield enchanting a permanent that enters the battlefield at the same
>   time." Multi-target blinks (Brago, Displace, Ghostly Flicker) used to exile and return one target at a time.
> · **CR 704.5m:** `sba.js` puts an Aura attached to nothing into its owner's graveyard; a Curse (`enchantedPlayerId`), Animate Dead
>   before its trigger (`enchantedGraveyardCard`) and a bestowed creature are exempt (attached to something / not an Aura).
>   `classLevels.test.js`'s Mask token fixture now enchants a Plains (an unattached Aura token is binned, rightly).
> · **The guard lifted:** Displacer Kitten's and Brago's arms trade shelf D21's `typeNeg aura` for `auraEntryModeled` — an Aura is
>   offered unless its Enchant line is one the return can't place (pins flipped in `displacerKittenBlink` / `flickerTargets`).
> · **The flicker policy:** an Aura's gain is its RE-AIM — the host the return will choose vs its current one, scored by the same
>   policy on the board the return sees (the leaving permanents exiled); −∞ for no host or an unread side. Brago decides the
>   permanents first, Auras after. And, for every target: nothing that would go home to another player (Brago's "under their
>   owner's control" — a permanent you took) is flickered.
> · **⚑ AI cast change (the shared intent reader):** the `cantAttack` / `cantBlock` / `activatedAbilitiesLocked` grants counted as
>   buffs, so the AI cast **Pacifism / Arrest / Prison Term** (30 Auras whose whole bonus is a restriction) on its OWN best creature
>   (probe-proven). A restriction now reads as a curse, or as the drawback of a buff beside it (Undying Rage stays own); Crippling
>   Blight and Cast into Darkness (held before) cast on enemies. **Action choices change** for seats with these cards, with Brago or
>   Displacer Kitten (Auras now offered), and for any multi-target blink (one event) — COMMS flag for Omnath.
> · Witness `auraReentry.test.js` (25) + a Dragon Fangs case in `auraSelfAttachReturn.test.js` (the effect's named host is an
>   opponent's creature) — 20 of the first 23 failed on the HEAD engine; the 3 that passed are guards, each mutation-pinned.
> · ⚠️ Found, not fixed (chips task_9420b128 · task_2f9dadc6 · task_18eb6934): the AI's Aura CAST puts a Curse on the first player
>   by id (Fraying Sanity on itself) and a non-creature-host Aura on the first permanent by id (Petrify, Suppression Bonds on its own
>   Mind Stone) — `pickAuraCast` sends every non-creature target to the mana-Aura rule (probe-proven); the Aura WITHHOLDINGS that
>   can now be lifted, each its own slice (Replenish's mass return, an enchantment tutor-to-battlefield, Mole Module, token copies,
>   the delayed blink, detain, Copy Enchantment); a human seat still doesn't choose (needs a pause in the shared entry).

> ## 🖱️ 2026-10-16 — FIX: the Academy board's cast chooser — every cast variant is reachable (follow-up to shelf D16) · **±0** · corpus unchanged
> Suite **18,992** green (1,780 files, 1 skipped — on 4463487c). Flip-diff n/a (UI only — no engine file touched). **Mutants 11/11**, restore byte-identical.
> · **The bug.** `LearnBoard.clickPermanent` dispatched `targeting.options.find(...)` — the FIRST option aimed at the clicked
>   permanent. legalChoices interleaves normal, kicked, normal, kicked …, so a kicked / teamwork / other-mode / alternative-cost
>   cast at the same target was never reachable by click; a card whose options take no target (Village Rites, a kicker
>   creature, a modal double-faced card's land) or target a player or a stack object entered target mode with nothing
>   clickable. The fallback bar showed 6 options and its labels named only the kicker and escape, so Village Rites' two
>   sacrifices read identically.
> · **The fix (UI only).** `castChooserView(options, boardIds, pickedId)` — board targets highlight, every off-board target
>   (player, stack object, graveyard card) gets a button, targetless plays are rows; a picked target with more than one cast
>   lists them. Rows come from `variantChoices`: each labelled by what differs (face, target, the clauses not every row
>   shares; "Normal cast"; repeats numbered). `castVariantClauses` is the one source of variant wording — mode, X,
>   kicker/teamwork, bestow, emerge, flashback, escape, alt (evoke named), Bolas's Citadel's life cost, the additional costs
>   — and `actionLabel` appends it. Player targets read as seats; same-named targets get their controller. The chooser is
>   derived from the live decision each render (it closes itself when its card has no options left). Also: the commander
>   tile opens the chooser (it only magnified before — a commander cast was reachable only through the 6-cap bar); a land
>   that is a legal target is targeted, not tapped, under manual mana; an opponent summary glows while it holds a target;
>   the bar's overflow is a "+N more" sheet.
> · **Live check (dev server, scratch data root, a seeded commander puzzle):** HULK SMASH! at Opponent 1's Sol Ring listed
>   the plain cast and both teamwork casts, and the picked row dispatched with `kicked: true` and its tap set; Village
>   Rites, Baloth Gorger (Normal / Kicked +3), Blaze (player buttons, then X=1–9), the commander and the overflow sheet all
>   dispatched the option shown.
> · Witness `castVariantChooser.test.jsx` (16 — engine-backed HULK SMASH!, Village Rites, Baloth Gorger, Blaze; labels;
>   the rendered bar; the overflow and commander hint).
> · ⚠️ Found, not fixed: LearnView's list-mode `DecisionPrompt` (no board) still renders `opt.name || opt.kind`, not
>   `actionLabel`; `actionLabel` has no bespoke wording for activate-ability / crew / cycle / loyalty, so several read
>   "activate ability" alike (now numbered in the overflow, still alike in the bar); the engine does not offer Stomp (the
>   Bonecrusher Giant adventure) in the seeded position — not investigated.

> ## 📚 2026-10-16 — CITATION GATE (docs only): every CR citation names a real rule; the check joins `npm run lint` · **±0**
> Suite **18,952** green (1 skipped; 1,777 files) under the gate lock on 4d599284; rebased onto 4463487c after, where the
> citation check and eslint were re-run (lint 0). Comments and test titles only: 45 of the 53 source files are
> token-identical to their parent (espree tokens, comments excluded), the other 8 are test files whose describe/it
> titles carry a corrected citation. Checker witness mutants **5/5** killed (a sixth is equivalent).
> · **130 citations corrected:** the 122 that named no rule (25 numbers — 701.19e ×25 → 701.24a/b or dropped, 505.5b ×13
>   → 505.6b, 602.5i ×9 → 602.5d/307.5, 203.4c ×9 → 700.12, 715.3e ×8 → 715.3d, 701.32d ×8 → 701.37a/b, …; every old →
>   new number and its reason is in the commit body) and 8 real rules co-cited inside those citations for the wrong thing
>   (103.2 → 103.3 ×2, 613.4a ×4 removed, 601.3e → 601.3b ×2). Each new number was read in cr_current.json; where no
>   rule says it (9 comments: "a library search always shuffles"), the number is dropped and the comment says so.
> · **Comments the CR contradicts, corrected:** suspend's free play is optional (CR 702.62a, "you may play it") — three
>   comments called the engine's offer a simplification of a mandatory cast. The cumulative-upkeep quote is now 702.24a's.
> · **The gate:** `npm run lint` = eslint + `scripts/check-cr-citations.cjs` (ci.yml and release.yml run lint). The
>   checker now joins each file's lines (a citation wrapped across a line break is read) and reads `CR-701.19e` and both
>   ends of a range; the per-line scan had missed 5 of the 122 and reported 117. 9,925 citations, 0 name no rule. Witness
>   `scripts/check-cr-citations.test.js` (8).
> · ⚠️ Found, not fixed (queued): real rules cited for the wrong thing outside the rewritten citations — tribute
>   702.96/702.96a (Overload) → 702.104, emerge 702.97/702.97a (Scavenge) → 702.119, dethrone 702.104a (Tribute) → 702.105,
>   search 701.19a/b (Regenerate) → 701.23, monstrous 701.32b → 701.37b, die rolls 726.2–726.4 (the initiative) → 706,
>   evolve's comparison 702.100d → 702.100a, ~20 uses of 601.3e as a generic permission. One behaviour gap: mulliganPolicy's
>   cost fallback counts a {2/X} pip as 1 (CR 202.3f: 2).

> ## 🔧 2026-10-16 — FIX: "…your opponents control" reads a permanent like every other count scope (the face that is up, every creature type) · **±0**
> Suite **18,956** green (1 skipped; 1,777 files). Flip-diff **0 / 0 / 0**. **Mutants 7/7**, restore byte-identical.
> Lint 0; CR citations: no new dead cite (117 before and after, all pre-existing).
> · **The report** (a changeling never counted by a tribal board count — Malakir Bloodwitch's Vampires, "for each Goblin you
>   control" — because `countMatches` reads the printed type line) **was already answered by P·39 (e111439d, 2026-10-01)** for
>   the player-scoped counts: countForSpec's `permanentsYouControl` reads each permanent through `countMatchesPerm` — the face
>   that is up (CR 712.8d) and, for a CREATURE type only (CR 205.3d), every creature type through
>   `layers.permIsEveryCreatureType` (the Changeling keyword, never a mention). Re-proved through the cast path; nothing to fix
>   there. `cardIsChangeling()` (the oracle-mention read the report named) no longer exists.
> · **The keyword read is exact on the corpus.** `keywords.hasKeyword(card, "changeling")` takes Scryfall's keyword array, else
>   a keyword-position oracle match; across the bundled snapshot the two agree on all 72 changelings, and the oracle read
>   matches no card that only MENTIONS the word (Maskwood Nexus, Belonging, Springleaf Parade make changeling tokens). It is
>   NOT narrowed to the array: a saved deck's cards arrive already shaped from the deck store (name, type, mana, oracle) and
>   `learnDeckEnrich` never backfills `keywords`, so the oracle read is what makes their changelings changelings. A "with
>   changeling" token is minted with `keywords: ["Changeling"]` (tokens.js) and reads the same.
> · **Kindred counts too.** Firdoch Core (Kindred Artifact — Shapeshifter, Changeling) IS a Vampire: kindreds share the
>   creature types (CR 205.3m, 308.2). The line is "has the ability and can have creature types", not "is a creature".
> · **The fix.** The opponents' sum (`who:"opponents"` — Dockside Extortionist, Mana Geyser, Dragon's Desire, Riot Control) was
>   the last scope on the printed `countMatches`: it read a double-faced permanent's whole "Front // Back" line, so an
>   opponent's Edgar, Charmed Groom was an artifact (Dockside made 3 Treasures for 1), a tapped Ojer Taq a land (Mana
>   Geyser {R}{R} for {R}), Fable of the Mirror-Breaker a creature (Riot Control +1). Over-counts — the forbidden direction;
>   162 nonmodal DFCs (156 transform, 6 flip) print a counted type on the back face only. It now asks `countMatchesPerm`,
>   like the controller, target and defending-player scopes. The changeling half is latent there: `parseCountSource` emits
>   no subtype for this scope (pinned).
> · Witness `boardCountScopes.test.js` (12): Bloodwitch + Woodland Changeling, Firdoch Core, Maskwood Nexus and Springleaf
>   Parade (not Vampires), Belonging's tokens; Spitting Earth's Mountains and Smaug's Treasures never count a changeling;
>   Dockside, Mana Geyser, Dragon's Desire and Riot Control beside front-face-up DFCs; an opponent's changeling; "that player
>   controls" and "your opponents control" agree on one board. Six of the twelve were red at c1f630ab (the opponents block).
> · Mutants: the opponents sum back on `countMatches` · every creature type for any subtype · the whole-line read in
>   `countMatchesPerm` · no every-creature-type disjunct · a bare /changeling/ mention for the keyword (also makes Belonging
>   itself a Vampire) · the opponents sum ignoring "tapped" · a changeling token minted without the keyword.
> · ⚠️ Found, not fixed (queued — task chip raised): **a nonmodal DFC whose front face has no subtype dash dies on entry.**
>   `layers.cardTypesOf` takes the types left of the first "—" of the whole line, so Westvale Abbey ("Land // Legendary
>   Creature — Demon") derives as `[Land, //, Legendary, Creature]`, a 0/0 creature: played as the land drop, the
>   state-based action puts it straight into the graveyard (Heirloom Mirror cast: the same). 23 cards (Westvale Abbey, Heirloom
>   Mirror, Altar of the Wretched, Soulcipher Board, Saheeli's Lattice, Sunbird Standard, Dormant Grove, …); ~38 more get other
>   back-face types (Treasure Map derives Land). The concrete face of the 10-01 queue item "the layer derive reads a
>   double-faced card's whole type line". Also: `cardsInGraveyard` reads a DFC's combined line in a graveyard — right for a
>   split card (CR 709.4c), wrong for a double-faced card (CR 712.8a).

> ## 🔧 2026-10-16 — FIX: generic is paid COLORLESS FIRST (D26's floating {R:3, C:2}) · **±0** · corpus 15,492
> Suite **18,950** green (1,777 files, 1 skipped). Flip-diff **0 / 0 / 0**. **Mutants 5/5**, restore byte-identical. Lint 0;
> citations 117 unresolved (the baseline, the same 117 as c1f630ab; this slice adds six, all resolve). 48 July-list games
> **byte-identical** to c1f630ab, twice (`a1a9f98e68c3b6c3` (8) / `fdbb728c27d644a7` (40)).
> · **The bug** (D26's chip task_4cf7d58e, 09-30). `planPaymentCore` paid generic from mana already made in W→U→B→R→G→C
>   order, colorless LAST: a {2}{R} from a floating {R:3, C:2} spent the three red and kept both colorless, and the Lightning
>   Bolt meant to follow was not offered.
> · **The fix.** `manaModel.GENERIC_SPEND_ORDER` (C, W, U, B, R, G) is the one order every generic spend reads: the
>   floating-pool drain; the drain after each auto-tap (a tap's colorless before the color it was taken for, whichever symbol
>   the card prints first); a restricted entry's generic; the explicit tap's activation cost (`payActivationFromPool`,
>   colorless-first already, now the shared constant). Any type of mana pays generic (CR 107.4b); colored mana left floating
>   can still pay a colored pip later in the step (CR 106.4), colorless only generic or a colorless symbol (CR 107.4c). So
>   colorless first loses no later payment the old order could make, except one with a {C} pip (rare).
> · **Reach.** Only the floating-pool drain moves real games. Bundled corpus: 11 of the 12 cards that add {C} beside a color
>   print the {C} first (the twelfth, Opening Ceremony, is a sorcery), so the post-tap drain already took their colorless
>   first; no card mints a restricted entry holding colorless beside a color. Both paths are pinned on hand-built records.
> · **⚑ Results (flag to Omnath):** the 48 July-list games are byte-identical; the change moved none of them. It moves a
>   game only where a generic payment draws on mana already made that holds colorless beside a color, with some left over
>   (a Sol Ring's spare {C} beside floating color): then a different mana floats, and the later offers can change. Whether
>   that moves the epoch cut is Omnath's call.
> · **Pins updated, each read first, concern kept:** `actionDispatcher.test.js`'s two pool-arithmetic pins asserted the
>   W→…→C order ("G before C"); they now assert colorless first. Their W2 note (07-01) called the deleted pool-only heuristic's
>   C-first generic a divergence; it was the right call. `kikiFamilyTokenCopy.test.js`: D26's comment blamed the generic for
>   spending the red; measured, the {R} pip spends it in either order (comment only).
> · Witness `genericSpendOrder.test.js` (7), through `legalActionsForPlayer` + `dispatchAction` on real oracle text:
>   Purphoros's {2}{R} from {R:3, C:2} leaves {R:2} and the Bolt is cast; Sliver Queen's {2} from {R:1, C:2} leaves the red
>   and the Bolt is cast; an exact {2}{R} from {R:1, C:2} still spends all three (the red on the pip); Rakdos Signet's
>   explicit tap pays its {1} with the colorless. Plus the post-tap and restricted-entry pins.
> · `runtime-fingerprint.mjs` not run: it fingerprints `manaProduction` / `doublerProfile` / `isPureDoubler`, none touched;
>   `planPayment` is out of its scope by its own header. The witness and the bench are this change's instruments.
> · ⚠️ Found, not fixed (queued, chip task_24aa20f2): the AUTO-TAP side has the same bias, by board order. `tapAny` taps the
>   first untapped source for generic, so with Mountain ×3 played before Sol Ring a {2}{R} taps all three Mountains, leaves
>   Sol Ring up and the Bolt dead (Sol Ring first on the battlefield: the Ring + one Mountain, Bolt live). And pool-first: a
>   floating {R:2} beside an untapped Sol Ring pays {2}{R} with both red and the Ring, floating {C}. That one is a judgment
>   call, not a dominance (floating mana empties with the step; the Ring does not): Colton's call.
> · **Coverage probe** (an instrumented scratch copy, hash-identical games): of 1,937 committed payments in the 48 July-list
>   games, 2 spent differently (a multi-mana green tap beside a floating {C}: a spare colorless is spent and a color floats
>   instead); neither changed a recorded decision — about once per 25 games.

> ## 🔧 2026-10-16 — FIX: a death event names where the card went — a Blightsteel Colossus shuffled away never "dies" · **+0** · corpus 15,492 (unchanged)
> Suite **18,956** green, 1,777 files (a fresh worktree has no `data/rules-index.json`: `rules-retrieval/route.test.js`'s four
> POST cases 500 until `npm run build:rules-index`, then 8/8). Flip-diff **0 / 0 / 0** (tier snapshots, HEAD c1f630ab → this).
> **Mutants 14/14**, restore byte-identical. Lint 0.
> · **The bug.** "If <this> would be put into a graveyard from anywhere, reveal <this> and shuffle it into its owner's library
>   instead" (Blightsteel / Darksteel Colossus, Progenitus) is a replacement inside `moveCardToZone`, but the death sites named the
>   logged event off the look-back's exile flag alone: `creature-dies` for a creature that never died (CR 700.4), and under Rest in
>   Peace — where the move applies the shuffle first — `creature-exiled-instead`. `gameAnalysis` counts combat `creature-dies` as
>   trades: measured before the fix, Blightsteel blocked by Blightsteel beside a Bears trade counted **2 attacker + 2 blocker
>   deaths** (truth 1 + 1), and the Crucible play-by-play said both Colossi died. The dies TRIGGERS were already right (they read
>   the look-back's flags, not the log).
> · **The fix.** `gameState.deathEventKind(lookback)`, in the move's own order — `exileTo` → exiled; the card's own shuffle →
>   **`creature-shuffled-instead`** (new); a graveyard exile → exiled; else `creature-dies` — read at all five sites: the
>   lethal-damage and legend-rule SBAs, `applyDestroyEffect`, `sacrificeCreatureEffect` and `sacrificeCreaturesTogether` (the
>   fifth was not in the brief; it had the same line). The destroy and sacrifice sites still log only a replaced creature. The
>   combat step's `combat-damage` summary `deaths` now lists only real deaths (it listed every look-back; no reader yet). The
>   narrator says where each went: "… is shuffled into its owner's library instead of dying (combat)", and "… is exiled instead
>   of dying" (an exiled-instead creature used to vanish from the play-by-play without a line).
> · **Found by probe, fixed (CR 614.1):** `sacrificeCreaturesTogether` moved its victims in order — the user's first — so a
>   sacrificed Dauthi Voidwalker had left before the opponent's creatures moved, and Barter in Blood put them into the graveyard
>   while their look-backs (dies triggers, death tally, log) said exiled. It now moves the carriers of a graveyard replacement
>   last (`graveyardReplacementCarriersLast`), as the destroy effect and the lethal-damage SBA already did. Living Death shares
>   the path (not separately witnessed).
> · **Why the headline witness is a combat, not lethal damage:** the printed Blightsteel is indestructible (CR 702.12b), so a
>   lethal-damage fixture never moves it and passes on the broken code. Infect damage is -1/-1 counters (CR 702.90c): two Colossi
>   blocking each other reach toughness 0 and leave by CR 704.5f — the same chokepoint, cause `combat`.
> · Witness `deathEventKind.test.js` (12) + `engineLogNarrator.test.js` (+1): the combat with and without Rest in Peace (kinds,
>   zones, the summary, `gameAnalysis`, the narration; a Bears trade is the control), Progenitus at the legend rule (an Isamaru
>   pair the control), Wrath of God, Misery's Shadow's exile ahead of the shuffle, Diabolic Edict and Barter in Blood with and
>   without Rest in Peace, Dauthi in one sacrifice event.
> · **For Omnath:** no decision reads these kinds (only `gameAnalysis` and the narrator do), so the relabel moves no decision
>   row; the one game-state change is the batch-sacrifice order, in games where a graveyard-replacement carrier is sacrificed in
>   the same event as other creatures.
> · ⚠️ Found, not fixed: the engine's CR 616.1 pick is fixed — a death-specific exile (Misery's Shadow, Lava Coil) always beats
>   the card's own shuffle, and the shuffle always beats Rest in Peace. The rules give that choice to the creature's controller,
>   who would usually keep the shuffle (a thief holding a stolen Colossus might take the exile).

> ## 🧰 2026-10-16 — TOOLING: the test wrapper's timeout kills only its own run · **±0** · corpus 15,492
> **Found by the 14-session fleet** (Colton started 14 worktree sessions on one machine, 2026-10-16; the Academy
> seat-label session flagged it). `app/scripts/test-with-timeout.cjs` — the wrapper `npm test` runs — tore down a timed-out
> or interrupted run by stopping EVERY node process whose command line held node_modules + vitest. With one worktree per
> session and node_modules junctioned into the main tree, that is every session's test run, mutation harness included —
> and the default limit is 5 minutes, about the length of a full suite on a busy box.
> · **The fix.** The vitest main is stopped by PID, then its descendants are collected from one process snapshot by
>   ParentProcessId (Windows keeps it after the parent dies) and stopped, pass after pass, until a pass finds none. Only
>   processes created since the wrapper started are eligible, so a recycled PID cannot pull in an unrelated process. The
>   sweep is sent as `-EncodedCommand` (an inline PowerShell loop through spawn's quoting silently no-ops).
> · **Verified live** (no suite test: the old code under test would kill the suite running it, and every other session's
>   runs): a bystander node process whose command line held node_modules/vitest, beside a 4-worker run timed out at 9 s —
>   the run's 4 workers were stopped, none left behind, and the bystander survived. The old wrapper matched the bystander.
> · ⚠️ Until a worktree rebases onto this commit its own copy of the wrapper still kills machine-wide: the fleet runs full
>   suites with `VITEST_TIMEOUT_MS=1800000` meanwhile.
> ## 🧹 2026-10-16 — REFACTOR: one seat-label source for the Academy (`seatLabels.js`) · **±0** · no engine change
> Suite **18,944** green (1 skipped): the full run under the gate lock passed 18,940 in 221 s; its 4 failures were
> `rules-retrieval/route.test.js` in a fresh worktree with no `data/rules-index.json` (CI builds it first), and they pass
> once it is built. Flip-diff not run (no engine or coverage path touched). **Mutants 2/2** (`boardContext`'s old
> "AI N" map fails 2 tests; the leaf set back to "AI N" fails 6 in 3 consumers), restore byte-identical. Lint 0.
> · **Why:** four copies of the seat labels disagreed. LearnBoard and the narrator said "Opponent 1–3"; LearnView (the turn
>   line, the seat strip, commander damage, the attack choices) and `boardContext` (the board text Ask Jace and the
>   Arbiter's unresolved-card rulings are grounded in) said "AI 1–3": "AI 1's turn" above a board that says "Opponent 1",
>   and a tutor naming seats the player never sees.
> · **Build:** all four import D14's zero-import leaf; the local maps are deleted. The narrator imports it as
>   `defaultSeatLabel`, so `options.seatLabel` still overrides; LearnBoard keeps `SEAT_LABELS[id] || ""` (an unknown id
>   renders empty, never raw).
> · **No exception for the model:** every Academy mode is free-for-all, so each AI seat is the player's opponent, and the
>   Arbiter question already says "An opponent cast …".
> · Witness `boardContext.test.js` (+1, 3 in all): the active seat, its row and a commander-damage source read
>   "Opponent N", never "AI N"; seen to fail on the old map.
> · ⚠️ Found, not fixed: `scripts/test-with-timeout.cjs`'s timeout / signal sweep stops every `node.exe` on the machine
>   that matches `*node_modules*vitest*`, so one run's timeout kills other sessions' vitest runs (flagged to the integrator).

> ## 🔧 2026-10-04 — FIX: an Equip targets a creature as it is NOW (the Lightning Greaves loop) · **+0** · corpus 15,492
> Suite **18,943** green. Flip-diff **0 / 0 / 0**. **Mutants 5/5**, restore byte-identical. Omnath's seed 1173515413
> (July list — Wolverine) ended `turn stall (9,965 ticks)`; it now finishes with a winner in 2 s.
> · **The loop.** Lightning Greaves' Equip {0} was offered onto a Lizard Blades that was ATTACHED to a creature ("While
>   attached, this isn't a creature"). The Equip attached, the CR 704.5n state-based action took the Greaves straight off
>   again (`equipment-unattached`), and the AI's equip pick repeated it 1,987 times. The same shape as 5a1c25a9: an Equip
>   that cannot stay, made free.
> · **The cause.** The offer (`legalChoices`) and the attach resolver (`resolvers.ATTACH`) read the PRINTED type line for
>   "creature"; the state-based action reads the layers. Both now read `permanentIsCreature` — one question, asked the same
>   way at the offer, at resolution (CR 608.2b: a target that is no longer a creature is illegal, the ability does nothing,
>   logged `spell-fizzle`) and in the state-based action.
> · **⚑ Offer changes, both directions:** an attached reconfigure Equipment, and any permanent that is a creature only on
>   its printed line (a God below its devotion), is no longer offered as an Equip or
>   attach-this-Aura target; a permanent that is a creature only by an effect (a crewed Vehicle, an animated land) now IS.
> · **Results (flagged to Omnath):** of 48 replayed games 44 are byte-identical; the other four keep every action, the winner
>   and the turn count and differ only in `legal.n` (one Equip target fewer or more). New hashes `a1a9f98e68c3b6c3` (8) /
>   `fdbb728c27d644a7` (40).
> · Witness `equipOfferParity.test.js` (+4, 26 in all): Lizard Blades attached / unattached, a crewed Smuggler's Copter, a
>   target that stops being a creature in response, and the AI's own picks beside Lightning Greaves.
> · **Seed 1662829456 (shelf list — Omnath, Locus of Mana) is NOT a loop:** Old Gnawbone beside Craterhoof Behemoth makes
>   about 2,000 Treasures in one combat (27 attackers connect), the stack draining the whole time, and the size guard's
>   2,000-permanent limit ends a legitimate game `engine-stuck`. Not fixed here: raising the limit before identical tokens
>   are offered as one action would make every later tick of such a game enormous (each Treasure is five tap-for-mana
>   offers). Queued with the offer dedupe (UPGRADE-BACKLOG E7.2's open note).
> · ⚠️ Found, not fixed (queued): `pickEquipAction` still assumes an offered Equip attaches and stays — a per-turn
>   "this Equip already failed" memory would end the whole family; the size guard counts permanents, not growth.

> ## ⚡ 2026-10-04 — PERF: the block gate's card-text readers are memoized · a 389-attacker turn 411 s → 111 s · **±0** · corpus 15,492
> Suite **18,939** green. Flip-diff **0 / 0 / 0**. **Mutants 7/7**, restore byte-identical. 48 July-list games
> **byte-identical** to e91c8f9c (no behaviour change).
> · **Found by profile, not by guess** (Omnath's seed 3166819773 on the shelf list — Earth Bent's Scute Swarm, 389
>   attackers declared in one turn): 74% of the game was `combatEvasion.canBlockAttacker`, called for every blocker of
>   every attacker on every tick of the declaration; half of that was `selfOracle` rebuilding a RegExp from the card's name
>   and re-normalising its rules text, and most of the rest `parseGroupBlockRestriction` doing the same.
> · **The fix.** `combatEvasion.memoByCardText`: both readers are pure functions of the card's NAME and TEXT, so the answer
>   is kept under those two strings (name, then text — never the card object, so a card whose text changes reads its new
>   text). `groupBlockRestrictionOf` returns one shared, frozen object. Bounded at 8,192 entries per reader.
> · Witness `combatEvasionTextMemo.test.js` (8): same name / different text, same text / different name, a card edited in
>   place, the raw Scryfall field, the shared frozen answer, and right answers past the limit.
> · ⚠️ Found, not fixed (queued, each needs its own profile-and-gates slice): after this fix the same game spends **43%
>   in `triggers.detectTriggers`** (re-reading every permanent's triggers on every event — `grantedTriggersForGroup`); in
>   ordinary games the standing costs are `layers.deriveCharacteristics` (25%), `legalChoices.castActionsFromZone` (23%),
>   `parseActivatedAbilities` (9%) and `classifyCard` inside the offer (8%). A `detectTriggers` memo must hand out frozen
>   results (the parse cache's rule, ENGINE-SCAFFOLD §3.4). The attack planner itself re-plans every attacker on every
>   tick (cubic in the board); one plan per declaration would be the structural fix.

> ## 🌀 2026-10-03 — THE COMBO LINE, slice four (E7.2): Squirrel Girl's finishes that are NOT combat — the sacrifice outlets · **±0** · corpus 15,492
> **Colton's correction (10-03):** her list does not only win by attacking — Altar of Dementia, Blasting Station and Altar of
> the Brood are finishes too. "Enough" is lethal by ANY route on the battlefield, and the AI takes that route.
> Suite **18,931** green. Flip-diff **0 / 0 / 0**. **Mutants 46/46**, restore byte-identical. Omnath's seven Squirrel Girl
> seeds replayed: all seven still finish with a winner.
> · **`outletFinishLine.js`** (new), read only for a seat with a token loop (`tokenLoopLine.tokenLoopState` → `loop.outlet`), so
>   no other deck's play changes. Outlets are recognised by parsed shape, never by name: a SHOT — "[{T},] Sacrifice a
>   creature: deals N damage to any target" (Blasting Station, Goblin Bombardment); a MILL — "Sacrifice a creature: Target
>   player mills cards equal to the sacrificed creature's power" (Altar of Dementia); a PASSIVE MILL — "Whenever another
>   permanent you control enters, each opponent mills a card" (Altar of the Brood).
> · **Enough.** Shots: the untapped outlet plus its untap triggers waiting on the stack (one more shot each; Goblin
>   Bombardment is one a token) cover every opponent's life. Mill: the tokens' power covers every opponent's library,
>   biggest token to biggest library. Passive mill: the libraries are empty. What is already on the stack counts — a shot
>   or a mill the seat has activated, each passive mill waiting — so nothing more is sacrificed than the kill needs.
> · **The line.** While no route is complete the loop keeps going past the combat threshold (an outlet kill needs no attack
>   step and cannot be blocked), up to `OUTLET_BOARD_CAP` (600 permanents). Once one is complete the loop stops and the
>   seat does nothing else: it fires the outlet — one offered activation a tick, smallest token for a shot at the least
>   life, biggest token for a mill — and passes priority while its own work resolves. Only token creatures are sacrificed.
>   On real sessions: Dementia mills exactly the library and the opponent loses to its next draw; the Station kills on the
>   turn the untaps cover the life total (three opponents at 40: two loop activations, 120 shots, turn 1); with the Brood
>   the loop itself is the finish and stops when the libraries are empty.
> · **⚑ An offer bug found on the way (fixed for every deck):** a required target with more than 64 candidates kept the
>   first 64 — "any target" beside 64 creatures offered NO player at all, so Blasting Station (or a Lightning Bolt) could
>   not be aimed at an opponent on a wide board. `effects/targeting.expandAtoms` now puts the players first when the list
>   is over the cap; at or under the cap the order is unchanged (pinned).
> · Witness `outletFinishLine.test.js` (41, real fixtures; stack objects made by the engine; four driver runs on real
>   sessions; nine labelled SYNTHETIC or boundary cases).
> · ⚠️ Under-reads (documented): on an opponent's turn the engine offers no activated ability, so the finish waits for the
>   seat's own turn (pinned as an under-offer); a partial kill (one opponent's worth of shots) is not taken; Walking
>   Ballista is not an outlet (counter removal, and the mana to grow it is E7.3); an opponent whose graveyard shuffles
>   back into its library is milled again and again while the tokens last; lifegain or damage prevention in response is
>   re-read each tick, not predicted.
> · ⚠️ Found, not fixed (queued): the sacrifice-cost offer is one action per victim per target — 283 identical Squirrels ×
>   64 targets is 18,000 offered actions a priority window (36,000 a doubling later), which is where a Station game's 6
>   seconds go: identical tokens should be offered as one representative; activated abilities are offered only on the
>   controller's own turn (P·62's finding — it is what makes this finish wait).

> ## ♾️ 2026-10-03 — A MANDATORY LOOP IS A DRAW (CR 104.4b / 732.4): Polyraptor + Marauding Raptor · **+0** · corpus 15,492
> Suite **18,890** green. Flip-diff **0 / 0 / 0**. **Mutants 59/59**, restore byte-identical. Omnath's Jurassic Ramp
> seed 1813482482 ended `engine-stuck — runaway stack (501 objects)` after 81 s; it now ends **a draw in 4 s**.
> · **The rule.** "If a loop contains only mandatory actions, the game is a draw." Marauding Raptor deals 2 damage to each
>   creature that enters, Polyraptor's enrage makes a copy, the copy enters. Nobody chooses anything and nothing stops it.
> · **`mandatoryLoop.js`** (new, a leaf). The driver (`learnSession.advanceUntilDecision`) shows it every tick and resets it
>   after any tick that was not a plain priority pass. It answers only for the narrow, certain case: 800 plain passes in a
>   row (100 four-player cycles) whose (priority holder, source, controller) sequence repeats with one period ≤ 64; the
>   stack never smaller than a period earlier (a long chain that is DRAINING is not a loop — 236 Squirrels entering beside
>   Altar of the Brood); the turn, phase, step and every player's life, poison, library and hand unmoved (a loop that moves
>   one of those is on its way to an end of its own); every object on top a triggered ability that is either a LINK — no
>   targets, from a permanent on the battlefield whose rules text offers no choice (no may / up to / choose / target /
>   unless / or / any number / random, reminder text aside) — or a BYSTANDER, whose resolution changed nothing on any
>   battlefield, in any zone or mana pool (an opposing Selvala, Heart of the Wilds watching each copy enter). Bystanders
>   alone are never a loop. Anything else falls through to the existing guards exactly as before.
> · The game ends `game-over`, status `draw`, with `decision.mandatoryLoop = { period, ticks, sources }` and a `game-draw`
>   log entry (rule, period, sources). In a pod it is a draw for the whole game (104.4b; no range of influence).
> · **⚑ Also fixed — a question with no effect, asked for ever:** Pantlaza, Sun-Favored's "you may discover X … Do this only
>   once each turn" paused for a yes / no on EVERY later Dinosaur that turn, then did nothing. `runProgram` now skips an
>   optional atom whose once-each-turn latch is already set (the atom's own key, `<source>_<op>`), so a player is asked
>   once. It was also what hid the loop from the watch when Pantlaza's trigger resolved inside each cycle.
> · **Results change (flagged to Omnath):** a game that ended `engine-stuck` on this loop now ends `draw` (a labelled result,
>   training weight 1, 0.5 each); Pantlaza decks lose the dead yes / no decision rows.
> · Witness `mandatoryLoop.test.js` (26): the real driver on a real session — the autopilot casts Polyraptor beside the
>   Raptor; with Pantlaza and an opposing Selvala as bystanders; a player acting inside the loop restarts the count; two
>   no-loop controls play to a winner — plus the watch's unit cases (labelled SYNTHETIC).
> · ⚠️ Under-reads (documented): a mandatory loop that moves life or a library (it ends by itself, or runs to the stall
>   guard); one whose links carry a choice word anywhere in their text ("or" is one); one longer than 64 ticks a cycle; an
>   optional loop the AI keeps accepting (correctly not a draw — it still ends engine-stuck; the shortcut is E7.5).
> · ⚠️ Found, not fixed (queued): the Scute Swarm attack-plan slowdown (seed 3166819773); seeds 1173515413 and 1662829456.

> ## 🔧 2026-10-03 — FIX: Commander's Plate's commander color identity in real games · the free-Equip loops (Captain America) · **+0** · corpus 15,492
> Suite **18,864** green. Flip-diff **0 / 0 / 0**. **Mutants 24/24**, restore byte-identical. Omnath's Captain America stalls
> (118 of the July list's 123 turn stalls name Captain America or Jurassic Ramp): seeds 3171500727, 197676014 and 2478174618
> replayed — all three now finish with a winner (they ended `turn stall`, 2,000 – 9,900 ticks).
> · **The loop.** An Equip activation that resolves to nothing, made free by Puresteel Paladin's "equip {0}": the AI's equip
>   pick (`opponentAI.pickEquipAction`) ends only when its Equipment sits on the best body, so it repeated without end. Two
>   cases. (1) Red Lizard Blades onto a creature with protection from red: the attach resolver's CR 608.2b re-check refused it
>   with the source's colours, and the offer passed none — the offer's `canBeTargetedBy` now carries them (CR 702.16b; an
>   illegal target is no longer offered). (2) Halvar, God of Battle, a creature whose card carries its Equipment face's
>   "Equip {1}{W}": the activation is LEGAL and does nothing (CR 301.5c / 701.3b — `attachLegality.test.js` pins the same for a
>   crewed Rover Blades), so the offer stays and the AI's pick skips an Equipment `equipmentBarredAsCreature` bars.
> · **⚑ The cause behind the first: Commander's Plate was wrong in every real game.** · 6 (10-01) stamped the seat's commander
>   identity at game start, read from the commander card's `colorIdentity` — which `server/learnDeckEnrich.js` never carried.
>   The stamp was `[]` ("colorless") for every deck the app or self-play loaded, so the Plate gave protection from all five
>   colours, the commander's own included. · 6's witnesses set the field by hand, so they stayed green (the hollow-gate law:
>   no witness ran the deck path). Now: the enrichment carries `colorIdentity` (a bare card, and an already-shaped saved card
>   that lacks it); `commanderIdentity.knownColorIdentityOfCards` answers null when any commander card states no identity —
>   unknown is never colourless, and the quality then does nothing (CR 903.4f).
> · **Results change (flagged to Omnath):** 38 of 40 replayed games are identical once the new card field is ignored; the two
>   that differ each seat a Commander's Plate deck (Captain America; Omnath, Locus of Mana) — a block the false protection had
>   barred is now legal. Every card object in a loaded deck now carries `colorIdentity`. New 48-game hashes:
>   `14b65ca7a0fb9846` (8) / `b4ef9f1b7661a29f` (40).
> · Witness `equipOfferParity.test.js` (22, real fixtures; the enrichment through its injected lookup; the AI's own picks
>   under a free Equip). First draft closed case (2) in the offer; the suite's `attachLegality` pin caught it, and the guard
>   moved to the pick.
> · ⚠️ Found, not fixed (queued): a permanent-faced modal DFC (Halvar, the Kaldheim Gods) is one merged card — the front-face
>   permanent carries the back face's text; `effects/atoms/misc.js anyColorChoice` reads the command zone inline, so "add one
>   mana of any color" follows the commander's identity only while the commander sits in the zone; a saved game from before
>   this fix keeps its `[]` stamp; the AI's equip pick still assumes every other offered Equip attaches.

> ## 🎯 2026-10-03 — PLAY-WEIGHTED · 62: Springbloom Druid (EDHREC #778), Loyal Apprentice (#753), Warstorm Surge (#731) · **+5** · corpus 15,492
> Suite **18,842** green. Flip-diff **+5, −0, zero RETIERED**: Springbloom Druid, Loyal Apprentice, Warstorm Surge → native-trigger;
> Excavating Anurid, Siege-Gang Lieutenant → native-mixed. Top 1,000 **904** (Colton's 10-01 checkpoint 866 → **+38**); top 2,500
> **1,743**. **Mutants 67/67** on the integrated tree, restore byte-identical. Built by a fan-out builder (rebased onto master
> before its gates); one positional conflict in `gameState.js` with · 60 resolved by keeping both helpers; re-verified on the
> integrated tree (the · 60 and · 61 harnesses re-run there: 46/46, 38/38). Two pins re-pointed, none deleted
> (`interveningIf.test.js` — the label-strip example is now Loyal Unicorn; `laccolithUnblocked.test.js` — the unread-sentinel example
> is now Stalking Vengeance).
> · Springbloom Druid: "land" joins the chosen-sacrifice filters; the existing optional-sacrifice pause and the tutor atom do the rest.
> · Loyal Apprentice: "That token / Those tokens gain(s) haste until end of turn" folds onto the preceding create-token atom (a
>   copy, not a write — the parse cache) as `hasteUntilEot`; the runtime grants layer-6 haste on the minted ids until end of turn.
>   "You control your commander" as a trigger condition now requires a commander the player OWNS (Loyal Drake, Loyal Subordinate and
>   Loyal Guardian tighten with it).
> · Warstorm Surge: the entering creature is the damage's source (`damageSource: "triggering"`): `applyDamageEffect` reads that
>   dealer's lifelink, deathtouch, infect / wither and protection only when the caller asks. Last known information:
>   `gameState.stampTriggeringLki` records the creature (power, toughness, colours, keywords, controller) on the waiting trigger as
>   it leaves, before any permanent of a multi-permanent event moves (the destroy effect, the lethal-damage pass, the bounce /
>   exile / tuck move), so a creature removed together with its lord is read with the lord's bonus.
> · ⚑ Terror of the Peaks and Verdant Sun's Avatar now read the entering creature's last-known power / toughness when it left
>   before resolution (they read 0; their bundled rulings say last-known). Efteekay and Yuma, Proud Protector get natively
>   resolving triggers (tiers unchanged). Witness `druidApprenticeSurge.test.js` (47; nine labelled synthetic or hand-built).
> · ⚠️ Under-reads (documented): the autopilot declines the land sacrifice (it gives up only tokens); a deathtouch dealer with
>   infect / wither under-kills; a mass sacrifice reads last-known values at each permanent's own move.
> · ⚠️ Found, not fixed (queued): TWO last-known stamps now ride a trigger's context — · 60's `triggeringLeftPower` and this
>   slice's `triggeringLki` — one record should serve both; `applyDamageEffect` ignores lifelink / deathtouch / protection for an
>   ability's own permanent source (Terror of the Peaks wearing Basilisk Collar gains no life — opt-in for now); trigger target
>   enumeration threads no source colours (a pro-red target is chosen, then fizzles on the CR 608.2b re-check); "you control your
>   commander" is still any `isCommander` permanent at three sibling sites (the Lieutenant static gate, an alt-cost check,
>   `legalChoices`); a self-enter "deals damage equal to its power" destroyed in response reads 0; activated abilities are offered
>   only on their controller's own turn in a main phase; the fixture generator resolves "Inferno" to a theme card.

> ## 🎯 2026-10-03 — PLAY-WEIGHTED · 61: Narset's Reversal (EDHREC #720), Dualcaster Mage (#675), Imp's Mischief (#658) · **+3** · corpus 15,487 · ⭐ **TOP 1,000 AT 901 — 90% REACHED**
> Suite **18,795** green (one run for · 58–61). Flip-diff **+3, −0, zero RETIERED**: Narset's Reversal, Imp's Mischief → native-spell;
> Dualcaster Mage → native-trigger. Top 1,000 **901** (Colton's 10-01 checkpoint 866 → **+35**); top 2,500 **1,740**. **Mutants
> 38/38** on the integrated tree, restore byte-identical. Built by a fan-out builder (rebased onto master before its gates);
> re-verified on the integrated tree. Two pins re-pointed, none deleted (`changeTarget.test.js` — Imp's Mischief's sentence is now
> HIGH; `manaDrainDelayed.test.js` — the X witness carries its `{X}{R}` cost).
> · The copy family: `stack.applyCopyInstantOrSorcery` rewritten — "You may choose new targets for the copy" is a `newTargets`
>   flag (the bare sentence does not re-aim): the copy keeps its mode, kick, X and target slots, keeps its targets when none is
>   wrong-sided and otherwise takes the first legal same-slot set, never a target illegal for its colours; a spell that "can't
>   be copied" is not copied. Narset's Reversal returns the original to its owner's hand (a flashback spell is exiled, a copy
>   ceases to exist); Dualcaster Mage is the same copy off an enters trigger.
> · Imp's Mischief: the change-target lane plus `lose-life-spell-mana-value`; `stack.stackSpellManaValue` is the one mana value of
>   a spell on the stack (a split half, an Adventure, X counted per `{X}`).
> · ⚑ Existing native cards change: Reverberate, Twincast, Reiterate, Flare of Duplication and Force of Rowan re-aim a
>   wrong-sided copy, fire magecraft "cast or copy" watchers and respect "can't be copied"; Mana Drain counts a split half's or
>   an Adventure's own cost and `{X}{X}` twice; the change-target family (Swerve, Misdirection, Deflection, Shunt, Ricochet Trap,
>   Bolt Bend, Redirect Lightning, Untimely Malfunction, Willbender) no longer offers a permanent with protection from the
>   spell's colours and has alternatives for an X-target spell cast for X = 1. Witness `spellCopyFamily.test.js` (44).
> · ⚠️ Under-reads (documented): "you may choose new targets" is policy, not a pause; a copy's targets change as one whole set;
>   an Aura spell offered to Imp's Mischief is not moved; the AI never casts Narset's Reversal or Imp's Mischief.
> · ⚠️ Found, not fixed (queued): `applyCopySelfSpell` (Sevinne's Reclamation) builds the copy with no cost (stack mana value 0);
>   `applyRetarget` (Deflecting Swat) and `applyRedirectToSource` enumerate with no colours; `freshCopyTargets` (storm) with no
>   colours, kick, X or mode; two wrong-number citations (CR 202.3b for 202.3e in the Mana Drain test; 603.3c for 603.3d in the
>   trigger flush).

> ## 🎯 2026-10-03 — PLAY-WEIGHTED · 60: Tribute to the World Tree (EDHREC #612), Goreclaw, Terror of Qal Sisma (#643), Mentor of the Meek (#657) · **+9** · corpus 15,484
> Flip-diff **+9, −0, zero RETIERED**: Tribute to the World Tree, Mentor of the Meek, Serra Redeemer, Inspiring Commander, Snarling
> Gorehound, Vicious Clown, Marketwatch Phantom, Neighborhood Guardian → native-trigger; Goreclaw → native-mixed. Top 1,000 **898**;
> top 2,500 **1,737**. **Mutants 46/46** on the integrated tree, restore byte-identical. Built by a fan-out builder (rebased onto
> master before its gates); one import-list conflict with · 59 resolved as the union of both name sets; re-verified on the
> integrated tree. No existing test edited.
> · Tribute: one branch atom, `draw-or-counters-by-triggering-power`, decided on resolution from the entering creature's power
>   through the layers; if it has left, its last known power — `moveCardToZone` stamps `triggeringLeftPower` on every waiting
>   ability that names the leaving permanent. The draw goes through `applyDrawEffect`, the counters through `applyAddCounter`.
> · Goreclaw: a cost reducer with a power floor (`minPower: 4`, the SPELL's printed power — a 0/0 that enters with X counters
>   gets no discount; generic mana only) and the `youControl` team pump with `powerAtLeast`, its set decided on resolution.
> · Mentor: the singular "another creature you control with power N or less enters" on the existing `etbMaxPower` gate; the
>   payment is the optional-mana-payment lane. Six cards with the same condition and already-modelled effects flip with it.
> · ⚑ `etbMaxPower` now reads the layers, not the printed number: Welcoming Vampire and Enduring Innocence no longer trigger for
>   a 2/2 entering under an anthem and do for a 3/3 under a −1/−1 static (their bundled rulings). Wispdrinker Vampire and
>   Irreverent Gremlin get a detected trigger (tiers unchanged). Witness `powerThresholdTrio.test.js` (42; four labelled synthetic).
> · ⚠️ Under-read (documented): a creature spell with `*` power gets no Goreclaw discount (no stack-zone CDA reader; CR 604.3
>   says it applies). ⚠️ Found, not fixed (queued): Marcus, Mutant Mayor's branch draws with `drawCards` directly (no draw
>   watchers) and has no last-known read; plain "Creature spells you cast cost {N} less" reducers discount a spell cast
>   bestowed; the Garruk's Packleader arm cites CR 109.5 for "another"; `controllerCreatureTargets` admits printed creature cards
>   that are not creatures; two test headers still call the enters power gate a printed read.

> ## 🎯 2026-10-03 — PLAY-WEIGHTED · 59: Kindred Dominance (EDHREC #701), Eldritch Evolution (#756) · **+3** · corpus 15,475
> Flip-diff **+3, −0, zero RETIERED**: Kindred Dominance, Eldritch Evolution, Kindred Judgment → native-spell. Top 1,000 **895**;
> top 2,500 **1,734**. **Mutants 49/49** on the integrated tree, restore byte-identical. Built by a fan-out builder (rebased onto
> master before its gates); re-verified on the integrated tree. One pin re-pointed, none deleted (`additionalCostLowProgram.test.js`
> — its "effect does not parse" example is now Neoform).
> · Kindred Dominance: one atom, `destroy-not-chosen-type`. The type is chosen on resolution by policy
>   (`choicePolicy.autoPickCreatureTypeToSpare`: the caster's creatures of a type minus everyone else's) — for every seat, the human
>   included; there is no picker (the Distant Melody convention). The set is every permanent that is a creature NOW and not of
>   the chosen type by its current types (new `layers.permanentCreatureTypes`; Changeling read off a layer-1 copy), destroyed in one
>   `applyDestroyEffect` call (indestructible, regeneration, umbra armor apply).
> · Eldritch Evolution: the existing sacrifice-cost lane and one tutor atom capped at 2 + the sacrificed creature's last-known
>   mana value, to the battlefield through `enterCardFromZone`, then the `selfExile` stamp. ⚑ The sacrificed permanent's values now
>   ride the spell's OWN `params.context.sacrificedForCost` (Fling and the other sacrificed-referent spells read that frozen copy
>   first), its mana value through `permanentManaValue`; the single-victim "sacrifice a creature" offer reads creature-ness through
>   the layers (an animated Mutavault is offered; a bestowed Aura, a God below devotion and a Saga are not).
>   Witness `kindredDominanceEvolution.test.js` (36; labelled synthetic cases).
> · ⚠️ Found, not fixed (queued): `shared.massCreatureTargets` admits any printed creature card (Wrath-class wipes hit a bestowed
>   Aura or a Saga with a creature back) and its `subtypeFilter` reads the printed front type line; `legalChoices.sacTypeMatches` is
>   still printed-card for the count-of-N cost, the union types and the ability lanes; the dispatcher does not re-validate a
>   victim's type at charge time; the activated-ability sacrifice stamp and `runProgram` read `victim.card.cmc`; `applyTutor`'s Pod
>   arm falls back to the shared state channel; the become-a-copy offer never targets a double-faced permanent.

> ## 🎯 2026-10-03 — PLAY-WEIGHTED · 58: Champion's Helm (EDHREC #740), Trailblazer's Boots (#656) · **+5** · corpus 15,472
> Flip-diff **+5, −0, zero RETIERED**: Champion's Helm, Trailblazer's Boots, Gimli's Axe, Hero's Heirloom → native-equipment; Dryad
> Sophisticate → native-body. Top 1,000 **893**; top 2,500 **1,732**. **Mutants 30/30** on the integrated tree, restore
> byte-identical. Built by a fan-out builder (rebased onto master before its gates); re-verified on the integrated tree. Three
> pins re-pointed, none deleted (`combatEvasion.test.js`, `equipAuraStaticGrantEQ1.test.js`, `hostSubtypeAttachedBonus.test.js` —
> each asserted the old limit).
> · Champion's Helm: "As long as equipped creature is legendary, it has hexproof" — a fifth attached-bonus condition,
>   `hostIsLegendary`, stamped on keyword grants only and read in `layers.gateMet` off the host's CURRENT supertype over its
>   copiable values (new `copyBaseOf`): a legend that became a copy of a nonlegendary creature loses it until the copy ends; a
>   token copy of a legend has it; an "isn't legendary" copy does not. A ward or protection tail under the condition is refused.
> · Trailblazer's Boots: nonbasic landwalk joins the grantable keywords and `combatEvasion.canBlockAttacker` gates it — the
>   attacker can't be blocked while the DEFENDING player controls a land without the basic supertype (CR 702.14c, 205.4c), read
>   off current characteristics (Thespian's Stage as a copy of a basic Forest is basic; a land back face is not a land).
>   Witness `helmAndBoots.test.js` (29; four labelled synthetic cases).
> · ⚠️ Found, not fixed (queued): `matchesSelector`'s `legendary` filter and the `hostHasSubtype` gate read the printed card under
>   a layer-1 copy; `permanentHasKeyword` seeds printed keywords from the card, not the copy base; an opponent's activated ability
>   is not offered outside its controller's own turn (an under-offer); `permanentGrantedWardCosts` ignores a gate; the Equip offer
>   lists the creature the Equipment is already on. ENGINE-SCAFFOLD §4.3 cites CR 500.4 for pools emptying; the bundled rule is 500.5.

> ## 🩸 2026-10-03 — fix: a sacrifice-for-mana Altar takes its victim last and never one the action's own cost needs; the stall guard counts empty-stack ticks · **±0**
> Omnath's histogram (COMMS 10-03 19:00Z): 31 `dispatch-error` games, Squirrel Girl in every one, plus turn stalls. Seven seeds
> replayed on master — still 5 dispatch errors and 2 stalls after the combo-line slice, so not a side effect of the old runaway.
> · ⚑ BUG 1 (stack traces from seeds 3060443104, 918440171): Phyrexian / Ashnod's Altar picks its victim as its tap commits
>   ("the least-valuable other creature"). Committed in plan order, it sacrificed a creature that a LATER tap of the same plan
>   still named — creatures tap for mana beside Cryptolith Rite / Enduring Vitality — ("Permanent tok-N not found"), or the very
>   creature the action sacrifices as its own cost ("Sacrifice victim perm-N not on battlefield"). It also counted that
>   creature's mana twice. Fix (`manaModel`): `commitPaymentPlan` commits sacrifice-a-creature taps LAST and hands
>   `commitManaTap` the action's reserved permanents (`costReservedPermanentIds`: its sacrifice / tap / return victims, its
>   source when the source taps, is sacrificed or is exiled); `withoutUnfeedableSacSources` drops an Altar that only a reserved
>   creature could feed, in `castPaymentSources`, the dispatcher's activation sources and the three offer-side affordability
>   checks (CR 601.2h) — the first version of the fix left a cast OFFERED that the payment refused; the Natural Order witness
>   caught it. All twelve dispatcher payment commits pass the reserve.
> · ⚑ BUG 2 (seeds 1454408901, 4129660823): `turn stall (2001 ticks)` on a turn that was not a loop — 236 Squirrels entering
>   beside Altar of the Brood and Blasting Station is two triggers each, four priority passes a trigger, ~4,700 ticks, the
>   stack draining the whole time. The per-turn budget now counts ticks that BEGIN WITH AN EMPTY STACK (a spin still shows:
>   each "act, resolve, act again" cycle starts one such tick); the raw count keeps a ceiling of `TURN_RAW_TICK_MULTIPLE` (10)
>   budgets for a stack that never empties. The reason string is unchanged.
> · Results: all 7 seeds finish with a winner. Witnesses `altarManaSac.test.js` (+7: the plan with the Altar first, the reserve,
>   Natural Order with only its own victim, Squirrel Girl's ability paid by three Squirrels and the Altar) and
>   `turnTickBudget.test.js` (+3: a preloaded stack; the raw ceiling).
> · **Mutants 33/33**, restore byte-identical. 48 July seeds byte-identical to 6feb96c4; flip-diff **0 / 0 / 0**; lint 0.
>   Suite **18,644** tests / 1,767 files (+10) — green in one local run.
> · ⚠️ Not mutation-pinned (mirrors of the tested filter, no real-card witness yet): the count-of-N sacrifice offer site, the
>   sacrifice-other ability offer site and the dispatcher's activation sources.
> · ⚠️ Found, not fixed — two REAL loops the new guards end cleanly (Omnath's July-list stalls, 118 of 123):
>   **Captain America** (seed 3171500727): the AI activates Lizard Blades' Reconfigure {2} again and again and each one
>   fizzles "all targets illegal (CR 608.2b)" — the equip slice re-offers it, and the 10-02 resolution re-check (or the
>   reconfigure target) is suspect; **Jurassic Ramp** (seed 1813482482): Polyraptor + Marauding Raptor, a mandatory infinite
>   loop — a draw by CR 104.4b; the engine ends it `runaway stack (501 objects)`.

> ## 🌀 2026-10-03 — THE COMBO LINE, slice three: Brago, King Eternal blinks EVERYTHING that has no reason against it · **±0**
> **Colton's rule (10-03, via Omnath's COMBO note):** "unless there's a reason not to, you blink everything every time."
> Before: the flicker chooser (shelf D21) took, of Brago's "any number of target nonland permanents you control", only the
> permanents that GAIN from a flicker (score > 0) — a permanent with nothing to gain and nothing to lose stayed home.
> · The change (`gameEngine.pickFlickerCandidate`): for an "any number" blink the pick is every target whose score is not
>   negative. A reason against is a negative score, as before: a token (never), +1/+1 counters, the seat's own attachments on
>   it, an Equipment/Aura that would come off — and, new, a planeswalker ABOVE its starting loyalty (it returns with the
>   printed number, CR 306.5b: above, the surplus is lost; at or below, the reset is a gain). "Up to one" flickers (Thassa,
>   Teleportation Circle, Photon) are unchanged: they still take only what gains.
> · Witness `flickerTargets.test.js` (14; two Brago pins re-pointed to the new rule, three added — plain permanents go,
>   loyalty above / at / below start, loyalty only weighed with a loyalty counter (a labelled synthetic board)).
>   **Mutants 5/5**, restore byte-identical. 48 July seeds byte-identical to c1122e34 (no "any number" blink in those lists).
>   Flip-diff **0 / 0 / 0**; lint 0. Omnath's hung Brago seed 4088110967 finishes in 4 s (Brago wins, turn 37).
> · Suite **18,634** tests / 1,767 files (+3) — green in one local run (261 s).
> · ⚑ Action choices change for a seat with an "any number" blink (Brago) — COMMS flag.
> · ⚠️ Found, not fixed: Nissa, Vastwood Seer // Nissa, Sage Animist (a creature whose back face is a planeswalker) is not
>   OFFERED as a target of Brago's "nonland permanents you control" — an under-offer (safe), cause not read.

> ## 🕯️ 2026-10-03 — THE COMBO LINE, slice two: the mana-untap line (Candelabra of Tawnos / Magus of the Candelabra) + mana Auras stack · **±0**
> **Colton's rules (10-03):** the untap "is used for untapping Cradle and making large mana; if it doesn't go mana positive
> then there's no choice … or untapping a land with enchantments on it"; and "you should stack mana enchantments on the same
> land". Before: the AI never activated either card (it skips every targeted ability and never taps a land except to pay),
> and each mana Aura went on its first own land by id.
> · The change: new leaf `manaUntapLine.js`. A land's VALUE = what `manaModel.manaSources` says it adds (a live count —
>   Gaea's Cradle — plus mana Auras and tap augments), read the same tapped or untapped. THE PLAN = the X most valuable own
>   lands for the smallest X that nets the most (Σ value − the activation's mana cost); no plan unless it nets mana.
>   `opponentAI.pickAction` runs it first in the ability block, only on its own main phase with an empty stack and only when
>   the plan brings a held, currently unpayable card within reach: tap each planned land for mana (the mana floats — the
>   one place the default AI taps a land outside a payment), then activate the untap on exactly those lands; the ordinary
>   cast pick then casts the card. `pickAuraCast`: a land mana Aura goes to the land already carrying the most.
> · The offer side only REORDERS: `legalChoices` passes `orderTargets` to `targeting.expandAtoms` for this ability, so the
>   activating player's tapped lands come first by value and the best set per X is the first offered (inside the 64 cap).
>   Same offers below the cap (pinned: C(5,1) + C(5,2) on a five-land board).
> · Witness `manaUntapLine.test.js` (23): values; the order; the plan (incl. "a mana rock is not a land", "the smaller X on a
>   tie", "no land worth 2 → no plan"); every gate; the line end to end with real cards (tap Cradle → tap the enchanted
>   Forest → Candelabra X=2 on both → cast Craterhoof Behemoth); Aura stacking. **Mutants 46/46**, restore byte-identical.
> · Blast radius, measured on the 48 July seeds: 43 games byte-identical; 5 changed, all at the intended seats — Omnath,
>   Locus of Mana ×3 (the first differing action is a mana Aura cast: the stacking rule) and cdh ×2 (tap-for-mana + Candelabra
>   activations appear). No winner changed. Flip-diff **0 / 0 / 0**; lint 0.
> · Suite **18,631** tests / 1,767 files (+23) — GREEN in one local run (296 s; Omnath's shelf run had stopped, so no load
>   timeout this time).
> · ⚑ Action choices change for a seat with an "untap X target lands" ability or with two or more land mana Auras, and the
>   offer ORDER changes for that ability (COMMS flag).
> · ⚠️ Open (UPGRADE-BACKLOG E7.4): the mana is made only for a card in HAND (not for a mana sink on the battlefield or a
>   commander in the command zone); the first mana Aura still goes to the first own land by id; Ancient Tomb is planned as a
>   2-mana land with no weight on its damage (asked Colton).
> · ⚠️ Found, not fixed (the third hang family in Omnath's list): seed 3166819773, Earth Bent — 371 Scute Swarms on turn 32.
>   59% of the time is `pickAttackPlan → selectProfitableAttackers → eligibleBlockersFor → canBlockAttacker`, recomputed for
>   every attacker on every declaration tick, with `parseGroupBlockRestriction` / `selfOracle` re-parsing text each call.
>   Of the 18 hung seeds without Squirrel Girl, 12 replayed after the pruning fix: 11 finish (every Brago Blink game — the
>   same combination bug), 1 ends engine-stuck (reason not read yet), and this one is the slow outlier; 5 not replayed yet.

> ## 🧮 2026-10-03 — fix: the target-combination search prunes dead ends (a single decision took over 100 s) · **±0**
> The second hang family in Omnath's shelf run (18 of 118 watchdog kills have no Squirrel Girl). Seed 1314382654 (cdh), turn
> 49: not a loop — ONE `legalActionsForPlayer` call took over 100 s. Profile: 94.9% self time in `targeting.kCombinations`'
> DFS, reached from `actionsCastSpell → expandCastChoices → targetSubsets` (an X-count-target SPELL, not the Candelabra
> activation the first read of the offer list suggested — the profile corrected that).
> · ⚑ The bug: the DFS looped `i < n` at every depth, so it walked every prefix that can no longer be completed. The 64-row
>   `limit` only ends the search once 64 combinations EXIST; a pick with fewer in total ("32 of 33": 33 rows) never reaches
>   it and visits ~2^n prefixes. The 2026-07 OOM fix capped the OUTPUT; the work was still unbounded.
> · The fix: the loop stops at the last index that still leaves enough elements (`i <= n - (k - combo.length)`). A pruned
>   prefix has no completion, so the rows and their order are unchanged — pinned against an independent reference for every
>   (n, k) up to n = 9, and by "30 choose 29 in under 500 ms" (unpruned: 2^30 calls, ~10 s).
> · Results: the seed finishes in 9 s (50 turns). 48 seeded games byte-identical (sha256 equal); flip-diff **0 / 0 / 0**;
>   lint 0. **Mutants 3/3**, restore byte-identical. No action-set or results change — no epoch flag.
> · Suite **18,608** tests / 1,766 files (+2): 18,607 passed locally and the known `crucibleRun.test.js` load timeout (20 s
>   cap, Omnath's 16 lanes on the box; passes alone) — CI is the full-suite verdict, as for the two commits before.
> · ⚠️ Colton's rules for the cards that first drew the eye here (10-03, banked in memory and UPGRADE-BACKLOG E7): Candelabra
>   of Tawnos / Magus of the Candelabra exist to untap Gaea's Cradle or a land carrying mana enchantments — "if it doesn't go
>   mana positive then there's no choice"; and mana enchantments stack on the SAME land. Not built in this commit.

> ## 🐿️ 2026-10-03 — THE COMBO LINE, slice one: the token loop (The Unbeatable Squirrel Girl) + the runaway size guard · **±0**
> Omnath's [Q-SG-LOOP] (COMMS 10-03): Squirrel Girl was in the pod for 100 of the 118 games his v0.163.0 shelf run's watchdog
> killed. Reproduced in 2.7 s (seed 2104572112): a LEGAL combo (Enduring Vitality + Concordant Crossroads + Badgermole Cub:
> every Squirrel is hasty and taps for 2, the ability costs 2 Squirrels and doubles them) played with no end — the AI
> activated on top of its own copy (59 on the stack, X read on resolution) and kept doubling with lethal already on the
> board; 1,500+ permanents, every decision slower than the last.
> · **Colton's rule (10-03):** "there's never a reason to actually make infinite squirrels … make squirrels, then forgo all
>   other choices, then a winning combo line. Combo decks should play to their combo line, not generic win positions."
> · The change: new leaf `tokenLoopLine.js`. The LOOP = an activated ability whose whole cost is mana and whose whole effect is
>   "create X creature tokens, X counted off what you control" (ONE card in the 34,620-card corpus: Squirrel Girl). ENOUGH NOW
>   = on its own turn before attackers, the creatures able to attack kill every living opponent through all their untapped
>   creatures; ENOUGH FOR NEXT TURN = every creature it controls does that twice over against every opposing creature. The AI
>   (`opponentAI.pickAction`) never activates the loop on its own copy, during its own attack, or past enough; at enough-now on
>   an empty stack it passes to combat instead of a land / cast / activation; `pickAttackPlan` then splits one combat across
>   every opponent (cheapest kill first, biggest attackers first, every attacker declared; a goaded attacker keeps the ordinary
>   plan). All of it declines or re-targets actions the engine already offered — it adds none.
> · The size guard (`learnSession.RUNAWAY_LIMITS`): more than 500 stack objects or 2,000 permanents under one seat ends the game
>   `engine-stuck` at once — the 2,000-tick budget counts ticks, not their cost, and never fires in time on a growing board.
> · Results: the repro seed ends on turn 15 in ~5 s, Squirrel Girl winning by combat damage on all three opponents (her board
>   peaks at 203 permanents, the stack at 2). 18 of Omnath's hung Squirrel Girl seeds replayed: all 18 finish, she wins 17.
> · Blast radius: 48 seeded games on the July lists (78,399 rows) byte-identical to master (sha256 equal); flip-diff
>   **0 / 0 / 0**; lint 0. **Mutants 84/84**, restore byte-identical. Witness `tokenLoopLine.test.js` (42).
> · Suite: **18,606** tests / 1,766 files (+42). ⚠️ The same load timeout as the cache slice: `crucibleRun.test.js` "plays
>   EXACTLY N games" (20 s cap) in the full run at `--maxWorkers=8` with Omnath's 16 lanes on the box; 18,605 passed; the file
>   passes alone (10/10). CI is the full-suite verdict.
> · ⚑ Action choices change for a seat that controls Squirrel Girl (COMMS flag; her earlier self-play data is survivor-biased).
> · ⚠️ Found, not fixed (queued): 18 of the 118 hung games have no Squirrel Girl. Seed 1314382654 (cdh): ONE decision took
>   over 100 s on turn 49 with Candelabra of Tawnos + Magus of the Candelabra on the battlefield — `legalChoices` enumerates
>   every X from 1 to the mana ceiling and, per X, every X-subset of the lands on the battlefield (`targetCountX` →
>   `expandCastChoices` → `targetSubsets`), at every priority window. Brago Blink is in 11 of the 18 (cause not traced).
>   The next combo-line slices are UPGRADE-BACKLOG E7.

> ## ⚡ 2026-10-03 — THE PARSE CACHE · self-play ~2.4× faster, games byte-identical · **±0**
> Omnath's [Q-PARSE-CACHE] (COMMS 10-03 06:15Z): self-play fell from ~222 to ~66 games/min between v0.149.0 and v0.163.0 with the
> games the same size; his profile put ~half the CPU in re-reading oracle text. Measured here on v0.163.0: 46% of a game's CPU
> inside `parseEffectClause`, reached from the cast offer (`parseCastProgram`, 28%) and `parseActivatedAbilities` (20%) at every
> priority window.
> · The change: new leaf `effects/parseMemo.js`; `parseEffectClause` parses each distinct (clause text, card type, hasX,
>   sourceScoped) once and returns the same DEEP-FROZEN program. A call outside that exact shape is parsed directly. The parser's
>   registries are inputs: `registerClauseParser` and the two grant-body validators drop the memo. Capped at 16,384 entries,
>   oldest evicted first. The card-level stamps in `parseEffectProgramInner` (additionalCosts, altCost, xSpell-from-cost,
>   selfShuffle, rebound, the escalate clamp, the self-exile retry) wrote onto the parse result in place — now each is a copy.
>   ENGINE-SCAFFOLD §3.4 carries the rule for every later change: a parse result is shared and frozen; copy before you stamp.
> · Proof it changes nothing: 48 seeded 4-player games (July seeds, Omnath's compare-worker, 78,399 decision rows) — output
>   byte-identical to the pristine v0.163.0 checkout (sha256 equal on both sets). Flip-diff **0 / 0 / 0** over 34,620 cards.
>   Coverage unchanged: corpus 15,467, top 1,000 891, top 2,500 1,730. Lint 0; citations 117 (baseline).
> · Speed (same machine, Omnath's 60k run sharing it): 8 games 91.2 s → 36.7 s; 40 games 492 s → 207 s (2.4×); the 34,620-card
>   tier snapshot 208 s → 139 s. `parseEffectClause` is 2% of the profile after the change.
> · **Mutants 29/29**, restore byte-identical. Witness `effects/parseMemo.test.js` (25): the key separates hasX / sourceScoped /
>   card type in both call orders; unnamed or non-boolean options bypass the memo; each registry invalidates; the bound and the
>   eviction order; seven real cards (Thrill of Possibility, Crash, Toxic Deluge, Treasured Find, It's Clobberin' Time!, Blue
>   Sun's Zenith, Borrowed Malevolence) keep their stamp while the same body without the stamp's cause stays unstamped.
> · The freeze found every in-place writer: the first cached run ended 7 of 8 games in a dispatch error ("object is not
>   extensible") from the seven stamps above; the full suite then found no other writer.
> · ⚠️ Not done (queued, measured after the cache — share of self-play CPU): `classifyCard` from the cast offer ~7%,
>   `parseActivatedAbilities` ~7%, `parseEffectProgram`'s strip chain ~5%, `detectTriggers` via granted triggers ~3% (each takes
>   a card object: the key needs a field-by-field audit); `deriveCharacteristics` from the lethal-damage SBA ~21% (board state,
>   not parsing).
> · Suite: **18,564** tests / 1,765 files (+25, the witness). ⚠️ NOT one green run locally: three full runs (two at default
>   parallelism, one at `--maxWorkers=8`) each passed 18,563 and timed out the same test — `crucibleRun.test.js` "plays EXACTLY
>   N games" (20 s cap) — while Omnath's 16-lane run shared the machine. That test plays vanilla Forest / Grizzly Bears decks
>   (no oracle text to parse) and takes 14.0 s alone with the cache OFF and 14.2 s with it ON, so the slice cannot move it; the
>   file passes alone (4 runs, 10/10). CI on a quiet runner is the full-suite verdict for this push.

> ## 🚀 2026-10-02 — v0.163.0 RELEASED · 40 commits since v0.162.0 · engine +56 · tagged early for user-facing fixes
> Cut under CLAUDE.md §7.2's user-facing-fix exception (Colton's go): short of the ~100-card line, but it ships the fixes a
> player sees in every game — attack triggers resolve before blocks (CR 508.2, 509.1), targets re-checked on resolution
> (CR 608.2b), one destruction ladder (Umbra saves in a wrath), stolen permanents to their owner's zones (CR 400.3). Steps
> (RELEASE.md): the Node pin checked (v22.23.2 stays: the newest v22 security release; v22.23.3 is a non-security patch) · the
> Spellbook cache warm (sync-spellbook 2026-10-02 09:14Z green) · `[Unreleased]` → `[0.163.0] - 2026-10-02` (dbd01827; CI
> 37048006497 green) · `git tag v0.163.0` on dbd01827 + push · release run 37048015228 green (test ×2 + build) · published
> 2026-10-02T19:06:27Z, marked Latest · `latest.json` verified BY CONTENT at the updater endpoint (version 0.163.0, a
> 420-character signature, the v0.163.0 installer URL). At the tag: top 1,000 **891** / 1,000, top 2,500 **1,730**, corpus
> 15,467 (+165 of the batch's +221 is the 10-02 card-data refresh, not engine work).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 57: Abrupt Decay (EDHREC #742), Chain Reaction (#708), Priest of Titania (#766) · **+4** · corpus 15,467
> Flip-diff **+4, −0, zero RETIERED**: Abrupt Decay, Chain Reaction → native-spell; Priest of Titania, Wirewood Channeler → native-mana.
> Top 1,000 **891**; top 2,500 **1,730**. **Mutants 16/16** on the integrated tree, restore byte-identical. Built by a fan-out builder
> (rebased onto master before its gates); re-verified on the integrated tree. Two existing pins re-pointed (`coverage.test.js` —
> Wirewood Channeler moves to MUST_FLIP; `subtypeScaledMana.test.js` — Priest's all-seats count), none deleted.
> · Abrupt Decay: the mana-value removal arm takes "nonland permanent"; new `layers.permanentManaValue` reads the mana value off the
>   object (a layer-1 copy has the copied cost, a non-copy token 0) — the manaValue restriction and Culling Ritual's set read it, so a
>   permanent that became a copy of something bigger is no longer offered. Chain Reaction: a new count kind, creatures on the
>   battlefield, read once on resolution (CR 608.2h) and admitted only by the damage arm. Priest of Titania: "<subtype> on the
>   battlefield" is the all-seats subtype count for curated words (changelings count); the planner and the explicit tap both see it.
> · ⚑ The each-creature damage sweep and the battlefield counts read creature-ness through the layers and the face-up face: an
>   animated land now takes the damage; a front-face-up Saga, a God below devotion and a bestowed Aura no longer do (Pyroclasm's
>   behaviour changes accordingly); Invasion of Lorwyn no longer counts as an Elf, Fable no longer as a creature for Gaea's Cradle;
>   Cloudpost's runtime amount is now its Locus count (it was a flat {C}). Witness `decayChainPriest.test.js` (21).
> · ⚠️ Found, not fixed (queued): the other mass-damage sweeps (each other creature, creatures and planeswalkers, creatures and
>   players) still read the printed type; Austere Command's mana-value filter reads the printed cost; the opponents-sum and graveyard
>   counts read a double-faced card's combined line; `actionsTapForMana` reads the printed card's mana ability while `manaSources`
>   is copy-aware.

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · fix: a spell or ability re-checks its targets' legality on resolution (CR 608.2b); Aura spells and attach abilities too (CR 608.3b) · **±0**
> Suite **18,539** green (one run with Abrupt Decay, Chain Reaction and Priest of Titania). Flip-diff **0 / 0 / 0**. **Mutants 43/43** on the
> integrated tree, restore byte-identical. Built by a fan-out builder (rebased onto master before its gates); re-verified on the
> integrated tree. One existing test re-pointed (`bestow.test.js` — a bestowed Aura spell whose target is gone now resolves as a
> creature, CR 702.103e).
> · ⚑ Resolution re-checked only that a target still EXISTED: a target that gained protection, hexproof or shroud in response, changed
>   controller, or stopped matching its restriction was affected anyway — Swords to Plowshares still exiled a creature that gained
>   protection from white. Now every target is re-checked at the effect program's entry with the SAME predicate that offered it
>   (enumerateTargets' pool for that atom slot, the cast-time context and X, the source's colours as they are now); an illegal
>   target is dropped (no part of the effect touches it, "its controller gains life" included) and the rest resolve; all illegal
>   fizzles. Activated and triggered abilities too (Prodigal Sorcerer, Chupacabra). Aura spells re-ask targetability with their own
>   colours; attach abilities with the source's. Refusals the engine can't actually judge are switched off during the re-check (an
>   unknown colour list, "can't be countered", a departed mentor) so a legal spell is never over-fizzled. "Target creature" reads
>   creature-ness through the layers only (a God below devotion five was targetable). Witness `resolutionTargetLegality.test.js` (50).
> · ⚠️ Found, not fixed (queued): the legacy cast path offers wrong targets for 11 single-atom spells (Fry without its colour
>   restriction, Smother / Easy Prey without the mana-value cap — the re-check judges them by the same legacy spec); triggered and
>   loyalty abilities pick targets with no source colours; redirect alternatives ignore the spell's colours; protection from
>   colourless (Giver of Runes) is never enforced for targeting; a silent try/catch in `atoms/stack.freshCopyTargets`.

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · fix: a destroy event reads its replacements against the board as the event began; one destruction ladder, one death look-back · **±0**
> Flip-diff **0 / 0 / 0**. **Mutants 46/46** on the integrated tree, restore byte-identical. Built by a fan-out builder (rebased onto
> master before its gates); re-verified on the integrated tree. No existing test re-pointed.
> · ⚑ Simultaneous destruction was processed one permanent at a time against a partly-destroyed board: a Hyena Umbra processed before
>   its Grizzly Bears was destroyed first and the Bears died too (Akroma's Vengeance, Nevinyrral's Disk, every wrath).
>   applyDestroyEffect now decides every replacement (indestructible, shield counter, regeneration, umbra armor) and every look-back
>   on the board as the event began, then applies them; an umbra destroyed in its host's place goes to the graveyard once;
>   graveyard-replacement carriers (Rest in Peace) move last. The lethal-damage state-based action uses the same order.
> · ⚑ Death events match where the card went: one look-back constructor (gameState.deathLookback) for the lethal-damage SBA, the
>   legend rule, destroy and both sacrifice paths — a Progenitus wrathed (shuffled instead) or a creature exiled instead no longer
>   fires dies triggers or counts as a death. Look-backs read the permanent's last-known types (CR 603.10a): a destroyed crewed
>   Vehicle or animated land is a creature dying; the one-creature edict pools are layer-aware. One ladder: destructionReplacementFor
>   moved into gameState.js (Culling Ritual's count reads it and now agrees with the destroy in either board order). Blood Money's
>   oracle has no "can't be regenerated" (regeneration saves from it — pinned); the rider pass-through is live for its op. Witness
>   `destroyEventLadder.test.js` (40 — 28 fail on the old engine).
> · ⚠️ Found, not fixed (queued): hand-built death look-backs in the sacrifice-for-cost, altar and fading paths (Rest in Peace exiles
>   but dies triggers fire; a Progenitus sacrificed for a cost fires them); mass-creature target gatherers still accept printed
>   creatures (a bestowed Aura is swept by "destroy all creatures"); mass damage reads printed types (an animated land takes none).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · fix: attack triggers resolve in the declare attackers step, before blockers are declared (CR 508.1m, 509.1); a removed attacker leaves combat (CR 506.4) · **±0**
> Flip-diff **0 / 0 / 0**. **Mutants 38/38** on the integrated tree, restore byte-identical. Built by a fan-out builder (rebased onto
> master before its gates); re-verified on the integrated tree. 13 existing tests re-pointed to the corrected timing (none deleted).
> · ⚑ The engine fired attack triggers — and the Ur-Dragon and annihilator hooks — at the ENTRY of declare-blockers, and nothing
>   stopped the defender from declaring blocks with them still on the stack: a creature a pending "can't block" trigger forbids
>   could block, and an attack trigger's tokens arrived after blocks. Now the attack declaration closes at the first action that
>   isn't declaring an attacker; the triggers trigger then (CR 508.1m) and go on the stack (117.5), and the step HOLDS with the
>   active player's priority until the stack is empty and everyone passes (508.2) — blockers are declared only after (509.1). No
>   attacker can be declared after the close. CR 508.8 reads the recorded declaration count, so a declared attacker removed during
>   the step no longer skips the blockers and damage steps.
> · ⚑ CR 506.4: an attacker that leaves the battlefield, changes controller or regenerates loses its combat record (the defender
>   was offered blocks against a destroyed attacker); a removed blocker keeps its records, so the attacker it blocked stays
>   blocked (509.1h, 510.1c); "blocking creatures get …" and "target blocking creature" share one check. New `combatRemoval.js`.
>   Witness `attackTriggerTiming.test.js` (26 — 22 fail on the old engine). A wrong-content citation fixed in passing (annihilator's
>   sacrifice: CR 701.16 → 701.21a).
> · ⚠️ Found, not fixed (queued): in declare blockers the active player gets priority before any block is declared (CR 509.1); block
>   triggers fire when LEAVING declare-blockers; the first-strike damage step always exists; 506.4's "stops being a creature" isn't
>   swept; wrong-content citations (removal.js "CR 701.16" for sacrifice; "CR 603.3c" for trigger targets in flushTriggers).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 56: Plaguecrafter (EDHREC #639), Ruinous Ultimatum (#651), Dramatic Reversal (#666) · **+6** · corpus 15,463
> Flip-diff **+6, −0, zero RETIERED**: Plaguecrafter, Demon's Disciple, Paradox Engine, Unstoppable Plan → native-trigger; Ruinous
> Ultimatum, Dramatic Reversal → native-spell. Top 1,000 **888**; top 2,500 **1,727**. **Mutants 29/29** on the integrated tree,
> restore byte-identical. Built by a fan-out builder (rebased onto master before its gates); re-verified on the integrated tree.
> · Plaguecrafter rides Blasphemous Edict's batch edict with a count of one — each player picks a creature or planeswalker in APNAP
>   order (CR 101.4) and all are sacrificed at once; "each player who can't discards a card" reads the players recorded as having
>   nothing to sacrifice as the event began. A sacrificed planeswalker that is no creature now reaches the planeswalker dies
>   dispatch. Ruinous Ultimatum is a one-sided destroy-all through the shared destroy (indestructible, shields, regeneration and
>   umbra armor apply); Dramatic Reversal (and Paradox Engine, Unstoppable Plan) untap "nonland permanents you control". Every
>   land / creature / planeswalker read is layer-aware and face-up-face only (CR 712.8d): Legion's Landing is nonland, Westvale
>   Abbey stays a land and is never offered to an edict (a false-positive fix for Blasphemous Edict and Barter in Blood too), an
>   animated Mutavault is a creature. Witness `plaguecrafterUltimatumReversal.test.js` (19, 3- and 4-seat).
> · ⚠️ Found, not fixed (queued): the layer derive reads a double-faced card's whole type line (in flight: the DFC fix);
>   `spellEffects.isCreature`, `shared.isCreatureCard` and `triggers.isCreaturePerm` read printed types (a battle or a
>   creature-backed Saga destroyed fires creature-dies watchers); single sacrifices never send a planeswalker to its dies dispatch;
>   single-creature each-player edicts and each-player discards aren't simultaneous; sacrifice-prevention statics (Sigarda) do
>   nothing.

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 55: Class levels (CR 716) — Caretaker's Talent (EDHREC #632), Wizard Class (#634) · **+6** · corpus 15,457
> Suite **18,467** green (one run with the exile-stamp fix, the quick trio, and the combat-timing and destroy-ladder fixes). Flip-diff **+6, −0, zero RETIERED**: Caretaker's Talent, Wizard Class, Ranger Class, Stormchaser's
> Talent → native-mixed; Esika's Chariot and Three Blind Mice → native-trigger (the same "create a token that's a copy of target token you control"
> sentence, each witnessed end to end). Top 1,000 **885**; top 2,500 **1,722**. **Mutants 65/65** on the integrated tree, restore
> byte-identical. Built by a fan-out builder; re-verified on the integrated tree.
> · New leaf `classLevels.js`: the class level bar is an activated ability ("this Class's level becomes N", only at level N-1 and
>   only as a sorcery — CR 716.2a) plus the static "as long as this Class is level N or greater, it has …"; the level lives on
>   the permanent (a designation, not copiable — 716.2b; a new object or a token copy starts at level 1 — 716.2d, 400.7). Statics,
>   triggers (26 battlefield scan sites) and play-from-top permissions read the Class's LEVEL VIEW; "When this Class becomes level
>   N" fires on the change. The whole-card gate parks any Class with a line the runtime reads off the raw card. The AI levels up
>   with leftover mana.
> · ⚑ Live false positive closed: triggers printed under a level bar fired from level 1 — 11 Classes at base (Artificer, Ranger,
>   Warlock, Wizard Class, Leader's / Scavenger's / Stormchaser's / Blacksmith's Talent, Does Machines, Advanced Floral
>   Invocations, Intermediate Chirography); none after (a raw-card vs top-section pin over all 35 Classes). Witness
>   `classLevels.test.js`.
> · ⚠️ Innkeeper's Talent stays parked (dossier: level 2 needs a ward grant over a has-counters selector; level 3's doubling
>   depends on WHO puts the counters, which `applyCounterDoubling` can't see). Found, not fixed (queued): the Vorinclex sentence
>   ("If you would put one or more counters …") is modeled as a doubler keyed to the permanent's controller, not to who puts the
>   counters; resolveTopOfStack catches resolver exceptions and only logs them.

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · fix: a card that leaves exile leaves every exile-only stamp behind (CR 400.7) · **±0**
> Suite **18,467** green (one run with Class levels, the quick trio, and the combat-timing and destroy-ladder fixes). Flip-diff **0 / 0 / 0**. **Mutants 10/10**, restore byte-identical. Built by the integrator
> between batches (found by the Reprieve builder). 148 related test files (1,946 tests) green before the suite.
> · ⚑ Exile-only state rides on the card as stamps — plot (CR 702.170d), suspend's counters and readiness (CR 702.62a), the
>   hideaway link (CR 702.75a), the impulse family, a void counter, Necropotence's face-down marker, the adventure permission
>   (CR 715.3d) — and only some exits from exile stripped them; a put onto the battlefield stripped none. A plotted Djinn of
>   Fool's Fall cast from exile carried its plot stamp onto the battlefield, and exiled again by Swords to Plowshares it was
>   offered as a free cast again; a suspended Lotus Bloom did the same. One list (gameState.withoutExileStamps) now serves
>   every exit: the cast, the zone chokepoint and the put. Witness `exileStampsLeaveExile.test.js` (5; four fail on the old
>   engine).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 54: Mangara, the Diplomat (EDHREC #610) + Trouble in Pairs (#626) — the attacks-you-with-two trigger and the extra-turn skip · **+3** · corpus 15,451
> Flip-diff **+3, −0, zero RETIERED**: Mangara → native-trigger, Trouble in Pairs → native-mixed, Everett K. Ross, Hapless Attaché →
> native-mixed (the same attack trigger beside a commander anthem the engine already models). Top 1,000 **883**; top 2,500
> **1,720**. **Mutants 36/36** on the integrated tree, restore byte-identical. Built by a fan-out builder; re-verified on the integrated tree.
> · One pass per attack declaration for each player an opponent attacks: Mangara counts the declared attackers at that player
>   and/or their planeswalkers (an intervening "if", checked again on resolution per its ruling — a creature that left still
>   counts by what it attacked; one removed from combat, regenerated or stolen doesn't; a planeswalker you no longer control
>   doesn't); Trouble in Pairs and Everett count creatures attacking the player only (CR 508.3e). Creatures put onto the
>   battlefield attacking were never declared and never count. The second-card and second-spell halves reuse the existing
>   per-turn watchers.
> · ⚑ Extra turns: "If an opponent would begin an extra turn, that player skips that turn instead" — advanceStep is the one
>   place an extra turn begins; a skipped one is dropped and logged, Final Fortune's lose-at-end-step record dies with the turn it
>   was bound to (its ruling), and "next upkeep" records wait for the next turn that actually happens. Witness `attackPairs.test.js`
>   (35, 4-seat).
> · ⚠️ Found, not fixed (queued): an extra turn cast on ANOTHER player's turn resumes play from the extra turn's taker (Nexus of Fate
>   on ai1's turn → user, then ai1 again; CR 500.7 says ai2 — confirmed by a probe); extra turns queued by an eliminated player are
>   never removed; a stolen attacker stays in combat (CR 506.4 — the combat fix in flight covers it).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · fix: "commander creatures you own" scopes by owner, not controller (CR 108.3, 110.2) · **±0**
> Suite **18,333** green (one run with Mangara and Trouble in Pairs). Flip-diff **0 / 0 / 0**. **Mutants 5/5**, restore byte-identical.
> Built by the integrator between batches (the owner fix's queued follow-up).
> · ⚑ The commander selector mapped the Background cycle's "Commander creatures you OWN have …" and Bastion Protector's "…you
>   CONTROL get …" to one controller scope, on the old invariant that the engine had no theft. Theft is native now, so a stolen
>   commander took the THIEF's Backgrounds (the thief was offered Clan Crafter's granted activation on another player's
>   commander) and lost its owner's (Flaming Fist's attack trigger went quiet). "You own" now reads the effective owner on
>   any battlefield; "you control" is unchanged. Witness `backgroundOwnerScope.test.js` (8 — every steal a real Act of Treason
>   cast; four fail on the old engine; the bare "Commanders you own" form through one labelled synthetic line, since Disguise
>   Agent's disguise grant is unmodeled).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 53: Liquimetal Torque (EDHREC #511) — becomes an artifact in addition to its other types · **+4** · corpus 15,448
> Flip-diff **+4, −0, zero RETIERED**: Liquimetal Torque → native-mana, Liquimetal Coating → native-activated, Myr Landshaper →
> native-activated, Argent Mutation → native-spell. Top 1,000 **881**; top 2,500 **1,718**. **Mutants 48/48** on the integrated tree,
> restore byte-identical. Built by a fan-out builder; re-verified on the integrated tree.
> · New atom `become-type`: "target … becomes an artifact in addition to its other types until end of turn" adds a layer-4
>   artifact type that ends at cleanup (CR 613.1d, 514.2); the indefinite form (Memnarch) stays parked. New
>   `layers.permanentHasCardType` reads a card type after layer 4 (a type an effect removed is gone; a double-faced permanent's
>   back-face types don't count; a copy reads the copied types). Routed through it: the "nonartifact" target and sweep filters
>   (Go for the Throat can't take a Torqued creature), "artifact creature" restrictions, the "non<type>" / absence / count /
>   metalcraft conditions, "can't be blocked while the defender controls an artifact", ten artifact target pools, and the Aura
>   host check at resolution plus the Aura-falls-off rule (an Enchant-artifact Aura on a Torqued creature falls off at cleanup).
>   The animated-land reads come along: an animated land is a creature for "you control a creature" and "noncreature".
> · ⚑ Fixes: Stone by Sunlight's "becomes an artifact" was filed as a creature SUBTYPE (now a card type); the legacy destroy
>   parse read "noncreature" and "artifact, creature, or planeswalker" as creature targets — Crush destroyed a Grizzly Bears,
>   Bedevil was offered only creatures (a corpus check of cast vs program targets went 3 mismatches → 0). Witness
>   `liquimetalTorque.test.js` (41).
> · ⚠️ Found, not fixed (queued): "protection from artifacts" isn't modeled though Nacatl Savage, the Tel-Jilad creatures,
>   Yavimaya Scion, Angelic Curator and Needlebug classify native (a hollow claim); the layer engine reads a double-faced card's
>   whole type line (Sidequest: Play Blitzball reads as an artifact); other "nonland" / "noncreature" readers read the printed
>   line; the Aura-falls-off rule checks only existence for other host unions; Spire of Industry's any-colour mana never shows up.

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · fix: every battlefield colour reader reads colours after layer 5 (CR 613.1e) · **±0**
> Flip-diff **0 / 0 / 0**. **Mutants 23/23** on the integrated tree, restore byte-identical. Built by a fan-out builder (queued by the
> token-colour builder); re-verified on the integrated tree. Witness `derivedColorReaders.test.js` (21 — all 21 fail on the old engine).
> · ⚑ Legality: the "non<colour>" target filter read PRINTED colours — Doom Blade was offered a creature Singe had turned black and
>   an animated Hissing Quagmire, and refused a Black Knight Cerulean Wisps had turned blue. An ability's source colours were
>   printed too — a Prodigal Sorcerer turned red still pinged Kor Firewalker (protection from red). Colour-qualified sacrifice
>   costs (Natural Order, Flare of Cultivation), colours-among counts and mana (Faeburrow Elder, Plaza of Heroes), the colour
>   gates (Gearsmith Guardian, the Cohorts) and the AI's protection-colour pick now follow current colours.
> · ⚑ Double-faced permanents had NO colour: every transform / modal double-faced card on the battlefield read colourless
>   (Graveyard Trespasser shrank under Ascendant Evincar; a white Brutal Cathar blocked Black Knight). A permanent's starting
>   colours now come from its face-up front face (CR 712.8d) — checked against Scryfall on all 394 transform and 98 modal cards.
>   The two counts inside the layer system read a recursion-free twin (boardCountColors) sharing the same applier.
> · ⚠️ Found, not fixed (queued): off the battlefield a double-faced card is still colourless (cast triggers misfire); triggered
>   abilities, loyalty abilities, equip and the resolution re-check thread no source colours, so protection never stops them; the
>   state-based check doesn't re-check "Enchant non<colour>"; Natural Order's search reads printed colours; wrong-content
>   citations (CR 105.1 for a colour change — it is 105.3; CR 712.4a for the front-face rule — it is 712.8a/d).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · fix: a flashbacked Plunder the Trollshaws draws two (the conditional branch keeps the cast-from-a-graveyard stamp) · **±0**
> Suite **18,290** green (one run with the layer-5 colour fix and Liquimetal Torque). Flip-diff **0 / 0 / 0**. **Mutants 2/2**, restore
> byte-identical. Built by the integrator between batches (queued from the 10-02 findings ledger).
> · The conditional branch node (effectAtoms.applyConditional) built its own condition context and dropped the resolving spell's
>   castFromGraveyard stamp; the condition reader answers a definite false without it, so the classifier admitted "If this spell
>   was cast from a graveyard, draw two cards instead" while every flashback cast drew one — a hollow native claim. The branch
>   now passes the stamp; a copy still carries none (CR 707.10) and draws one. Plunder is the only corpus card on this branch
>   (a probe over every card naming the condition). Witness `plunderTheTrollshaws.test.js` (4; the flashback and copy cases fail
>   on the old engine).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 52: Culling Ritual (EDHREC #587) — the mana-value sweep that pays per permanent destroyed · **+1** · corpus 15,444
> Flip-diff **+1, −0, zero RETIERED**: Culling Ritual → native-spell. Top 1,000 **880**; top 2,500 **1,717**. **Mutants 33/33**, restore
> byte-identical. Built by a fan-out builder; re-verified on the integrated tree.
> · Every nonland permanent on every battlefield with mana value 2 or less, judged on the permanent itself (a copy's copied mana
>   value; a non-copy token or a face-down permanent is 0; "land" through the layers). "Destroyed this way" reads the destroy's
>   own replacement ladder as the event began: indestructible, a shield counter, regeneration and umbra armor mean no mana;
>   exiled-instead still counts (the bundled rulings). The ladder moved out of applyDestroyEffect into the exported
>   destructionReplacementFor — same order, same predicates. One {B} or {G} per permanent (round-robin, {B} first — a per-mana
>   choice, CR 608.2d). The AI holds it as a mass wipe. Witness `cullingRitual.test.js` (20).
> · ⚠️ Found, not fixed (queued): a mass destroy decides each permanent against a partly-destroyed board (a Hyena Umbra processed
>   first leaves its Grizzly Bears to die — reproduced; fix in flight); type readers read a transforming card's whole
>   "Front // Back" type line (Search for Azcanta counts as a land); other mana-value readers ignore copy effects; Blood Money's
>   "can't be regenerated" pass-through is dead.

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 51: Saw in Half (EDHREC #582) — the dies-this-way token copies · **+1** · corpus 15,443
> Flip-diff **+1, −0, zero RETIERED**: Saw in Half → native-spell. Top 1,000 **879**; top 2,500 **1,716**. **Mutants 33/33**, restore
> byte-identical. Built by a fan-out builder; re-verified on the integrated tree.
> · The creature's copiable values, controller and layer-aware power/toughness are captured before the destroy; the two copies
>   (half power, half toughness, rounded up — set as part of the copy effect) are made only if it actually died this way:
>   indestructible, regeneration, Rest in Peace's exile and a shuffle-instead all mean no copies (CR 700.4, the card's bundled
>   rulings). The set-P/T rider now stamps that the original's P/T-defining ability is not copied (CR 707.9d) — which also keeps
>   Quicksilver Gargantuan copying Tarmogoyf at 7/7. Witness `sawInHalf.test.js` (30).
> · ⚠️ Found, not fixed (queued): a Wrath on Progenitus fires dies triggers for a death that didn't happen; a target that gains
>   hexproof or protection in response is still destroyed (CR 608.2b re-checks existence only) — both fixes in flight; no token
>   mint path stamps enteredOnTurn / timestamp; Impossible Man's copy names itself "this creature".

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 50: Cloud Key (EDHREC #608) — the as-enters card-type choice · **+1** · corpus 15,442
> Flip-diff **+1, −0, zero RETIERED**: Cloud Key → native-static. Top 1,000 **878**; top 2,500 **1,715**. **Mutants 37/37** on the integrated
> tree (the builder's 39, its three per-entry-site mutants folded into one: on master every entry reads the shared entry leaf),
> restore byte-identical. Built by a fan-out builder; re-verified on the integrated tree.
> · "As this artifact enters, choose artifact, creature, enchantment, instant, or sorcery." stores `chosenCardType` — its own field,
>   never the creature-type `chosenType` — and is made in the shared entry leaf (`enterReplacements.js`), so every entry chooses:
>   cast, put, search, reanimation, blink, The Ur-Dragon; a token copy makes its own. The policy picks the type naming the most
>   cards in hand + library. "Spells you cast of the chosen type cost {1} less" judges the face being cast; a bestowed spell is
>   an enchantment only. Gathering Stone's identical reducer line, under a creature-type chooser, builds nothing. Witness
>   `cloudKey.test.js` (27); one `costReductionMetric.test.js` pin re-pointed (it pinned the unmodeled chooser).
> · Docs: ENGINE-SCAFFOLD §4.5 now documents the entry-replacement leaf (the 10-02 non-cast entry fix).
> · ⚠️ Found, not fixed (queued): token copies skip their own entry replacements ("enters with" counters, enters tapped, as-enters
>   choices); the bestow cost lane reads the printed "Enchantment Creature" line for every other reducer and tax (a creature
>   reducer over-discounts a bestow cast; Thalia's tax misses it).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 49: Talon Gates of Madara (EDHREC #570) — the hand self-put lane · **+1** · corpus 15,441
> Flip-diff **+1, −0, zero RETIERED**: Talon Gates of Madara → land. Top 1,000 **877**; top 2,500 **1,714**. **Mutants 23/23**, restore
> byte-identical. Built by a fan-out builder; re-verified on the integrated tree.
> · "{4}: Put this card from your hand onto the battlefield.": a new activated-from-hand lane (offer → dispatch → stack → resolve),
>   offered whenever its owner has priority (instant speed is the card's point) and withheld under split second. It is not a land
>   play (CR 305.4): the land drop stays available and "whenever you play a land" stays quiet. The card stays in hand while the
>   ability waits; a card that left the hand in response does nothing. The enters trigger ("up to one target creature phases
>   out") now has an enemy side when optional and unrestricted; the mandatory and "you control" forms stay parked.
> · ⚑ Combat fix (legality): an attacker that phases out is removed from combat (CR 506.4) — the defender used to be offered a
>   block against it. Witness `talonGatesOfMadara.test.js` (22).
> · ⚠️ Found, not fixed (queued): a DESTROYED attacker also stays in combat with block offers (CR 506.4 — a fix is in flight);
>   filter lands' "{1}, {T}: Add one mana of any color" yields only {C} at runtime while coverage credits the line (Unknown Shores
>   and about 20 more); wrong-content citations (split second cited as CR 702.19a, which is trample; channel as CR 702.33a, kicker).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 48: Reprieve (EDHREC #603) — return target spell to its owner's hand · **+3** · corpus 15,440
> Suite **18,224** green (one run with Talon Gates of Madara, Cloud Key, Saw in Half and Culling Ritual). Flip-diff **+3, −0, zero RETIERED**:
> Reprieve → native-spell; Bilbo's Gambit → native-spell (the existing gift policy never promises, so its base mode is the whole
> spell — a documented under-read); Spellscorn Coven // Take It Back → native-mixed. Top 1,000 **876**; top 2,500 **1,713**.
> **Mutants 13/13**, restore byte-identical. Built by a fan-out builder; re-verified on the integrated tree.
> · "Return target spell to its owner's hand" parses to the existing stack-only bounce (Hullbreaker's), with no controller limit.
>   Returning is not countering: an uncounterable spell is still returned; abilities are never targets. The card goes to its
>   OWNER's hand (CR 400.3) as the whole card: counterSpellById now moves the whole split / modal-DFC / adventure card, never
>   the cast face's projection.
> · ⚑ Stack fixes (legality): a COPY of a spell goes to no zone and records no graveyard event (CR 704.5e, 707.10a); flashback's
>   exile overrides any named destination (CR 702.34a — Remand, Memory Lapse and Venser sent a flashback spell to hand or library,
>   castable again); a fizzled Adventure goes to its owner's graveyard, not adventure exile (CR 608.2b, 715.3d); a copy of an
>   Adventure puts no second card into exile (CR 715.3c); a card cast from exile drops its on-an-adventure permission (CR 400.7).
>   Witness `reprieve.test.js` (26).
> · ⚠️ Found, not fixed (queued): other exile-permission stamps (plotted, suspend, hideaway) survive a cast from exile; copies of
>   permanent spells made from a face cast keep the printed card (a duplicate card when the token leaves); a wrong-content
>   citation (CR 712.4a — meld — for front-face typing in stack.js).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · fix: a permanent that wasn't cast still enters as its replacement effects say (CR 614.12) · **±0**
> Suite **18,099** green. Flip-diff **0 / 0 / 0** (runtime-only). **Mutants 22/22**, restore byte-identical. Built by a fan-out builder;
> re-verified on the integrated tree (after Necropotence and the owner fix). CR citations unresolved 117 (unchanged).
> · ⚑ zones.enterCardFromZone — the entry every NON-cast path takes (reanimation, put-from-hand/library, blink returns, Living
>   Death, Rise of the Dark Realms, undying/persist) — applied only Kismet-style impositions and planeswalker loyalty; the cast
>   entry (resolvers.enterPermanent) applied every entry replacement. A reanimated Diregraf Ghoul entered untapped; a reanimated
>   Spike Feeder entered with no counters and died to the next state-based check; a searched-up shockland or check land entered
>   untapped for free; a put Saga was inert. Root cause: the replacements lived inline in enterPermanent, which the atoms cannot
>   import (resolvers → runProgram → atoms → zones would cycle). New leaf `enterReplacements.js` (apply + settle, moved verbatim)
>   serves both entries; only the cast facts differ (a permanent that wasn't cast has X = 0 — CR 107.3g, 107.3m — so Walking Ballista
>   still enters empty off the stack). One event, several permanents (CR 614.12): Rise, Replenish, Living Death, Genesis Wave
>   and multi-pick puts read every newcomer's replacements against the board as the event began; a tempting offer's bonus
>   searches are separate events. An entry the effect itself taps (Farseek) makes no shockland payment. The Ur-Dragon's cheat
>   now enters through the shared entry (it skipped replacements and landfall). 1,443 corpus cards carry at least one of
>   these replacements. Witness `nonCastEntryReplacements.test.js` (20 on real cards through real entry points; 11 fail on the
>   old engine).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · fix: a permanent keeps its owner through control changes (CR 400.3) · **±0**
> Suite **18,079** green (one run with Necropotence). Flip-diff **0 / 0 / 0**. **Mutants 16/16**, restore byte-identical. Built by a fan-out
> builder (found by the Massacre Wurm builder); re-verified on the integrated tree. CR citations unresolved 118 → 117.
> · ⚑ moveControl was the only path that put a permanent on another battlefield without writing `owner`, so a STOLEN permanent
>   looked like the thief's own: Act of Treason'd / Control Magic'd creatures died into the THIEF's graveyard, bounced to the
>   thief's hand, were tucked/exiled into the thief's zones, undying/persist returned them under the thief, and a stolen
>   commander's command-zone return was offered to the thief. moveControl now records the owner (never overwritten by a caller,
>   kept when control returns); the self-returns (undying, persist, the dies-return grants) find the card in the graveyard that
>   actually holds it; the Fblthp-style self-shuffle goes through the zone chokepoint. Witness `ownerZoneRouting.test.js` (37 —
>   31 of them fail on the old engine), steals cast for real, 2- and 4-seat.
> · ⚠️ Found, not fixed (queued): Background "commander creatures you own have …" reads "own" as "control" (a stolen commander takes
>   the thief's Backgrounds); a player leaving the game removes permanents they stole; wrong-content citations ("CR 702.92a" for
>   undying in 11 places — that rule is living weapon; "CR 500.4" for mana emptying in 19).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 47: Necropotence (EDHREC #519) — face-down exile with a card-bound end-step return · **+1** · corpus 15,437
> Suite **18,079** green (1 skipped). Flip-diff **+1, −0, zero RETIERED**: Necropotence → native-mixed. Top 1,000 **875**; top 2,500 **1,712**.
> **Mutants 54/54**, restore byte-identical. Built by a fan-out builder; re-verified on the integrated tree.
> · "Skip your draw step" was already enforced (CR 614.10). "Whenever you discard a card, exile that card from your graveyard": a
>   watch on the discarded object, retired by any later graveyard event for it (CR 603.6, 400.7) — only that same object is exiled.
>   "Pay 1 life: Exile the top card of your library face down. Put that card into your hand at the beginning of your next end
>   step": one atom — the face-down stamp plus a delayed return bound to that card (CR 406.3, 603.7); leaving exile strips the
>   stamp, so a card that left is never returned (CR 603.7c). Discard triggers now carry the discarded card's id at every site.
> · ⚑ Turn-loop changes (legality): the cleanup hand-size discard now fires discard triggers (CR 514.1, 701.9a); a cleanup step that
>   puts a trigger on the stack grants priority and is followed by another cleanup step (CR 514.3a — triggers used to resolve in the
>   next turn); a pay-life activation is not offered while the life total can't change (CR 119.8 — Teferi's Protection made
>   Necropotence and Yawgmoth's Bargain free and unbounded). Witness `necropotence.test.js` (26).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · fix: tokens have the colors their effect gives them (CR 111.3) · **±0**
> Suite **18,016** green (one run with the Steel Overseer fix). Flip-diff **0 / 0 / 0** (classification reads no token color).
> **Mutants 12/12**, restore byte-identical. Built by a fan-out builder (found by the Adeline builder); re-verified on the tree.
> · ⚑ Every token was minted COLORLESS: the descriptor's color words were dropped. Black Knight (protection from white) could be
>   blocked by white Soldier tokens; Honor of the Pure pumped no white token; Ascendant Evincar shrank black Zombies as "nonblack";
>   and the non<color> target restriction, which fails closed on a missing colors array, made EVERY token untargetable by Doom
>   Blade. Colors are now derived once, at the mint, from the descriptor (tokenColorsOf), for every create-token path; the
>   predefined tokens (Treasure, Food, Clue …) share one builder that stamps colorless; amass's Army is black (CR 701.47a),
>   fabricate's Servo colorless; token copies already took the original's colors. Layer-5 color effects still apply on top.
> · ⚠️ Found, not fixed here (queued): the non<color> restriction and several color counts read PRINTED colors and ignore layer
>   5 — a creature turned black by an effect is still a legal Doom Blade target. Witness `tokenColors.test.js` (19).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · fix: a card-type team filter is never met by every creature type (Steel Overseer) · **±0**
> Suite **18,016** green (one run with the token-color fix). Flip-diff **0 / 0 / 0**. **Mutants 2/2**, restore byte-identical.
> · P·39a let every creature type satisfy any word of controllerCreatureTargets' subtypeFilter — but that filter also carries
>   card types ("each artifact / enchantment creature you control" rides it as "Artifact" / "Enchantment"), so a non-artifact
>   changeling, or a creature made every type by Mirror Entity's effect or Maskwood Nexus, got Steel Overseer's counter. Every
>   creature type now answers only a creature-type filter (CR 205.3d), as at every other P·39 reader. Found by a read-only
>   inventory of the engine's artifact-type readers (76 sites — the map for the coming Liquimetal Torque slice).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 46: Valakut Awakening // Valakut Stoneforge (EDHREC #514) — any number to the bottom, draw that many plus one · **+1** · corpus 15,436
> Suite **17,996** green (one run for P·44–46). Flip-diff **+1, −0, zero RETIERED**: Valakut Awakening → native-spell (was land-partial).
> Top 1,000 **874**; top 2,500 **1,711**. **Mutants 22/22**, restore byte-identical. Built by a fan-out builder; re-verified on the tree.
> · The controller's form of the Puzzle Box composite: "any number" taken by a documented house policy — every card in hand except
>   a commander (CR 903.9b's command-zone option is unmodeled, so a commander is never tucked), hand order kept (CR 401.4) — then
>   that many plus one through the draw chokepoint (an empty library is the ordinary draw, CR 121.4).
> · ⚑ Fixed on the way: every modal-DFC FACE was cast COLORLESS (the bundled combined card carries colors [] — Scryfall keeps
>   colors on the faces): a red Valakut Awakening fired "whenever you cast a colorless spell" (Kozilek's Sentinel) and was a
>   legal "counter target colorless spell" target. Face colors now come from each face's own mana cost and Devoid line (CR
>   712.8f, 202.2; equal to Scryfall's per-face colors on all 196 faces). Witness `valakutAwakening.test.js` (17).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 45: Unbreakable Formation (EDHREC #564) — the Addendum as a cast-time stamp · **+1** · corpus 15,435
> Suite **17,996** green (one run for P·44–46). Flip-diff **+1, −0, zero RETIERED**: Unbreakable Formation → native-spell. Top 1,000 **873**;
> top 2,500 **1,710**. **Mutants 19/19**, restore byte-identical. Built by a fan-out builder; re-verified on the integrated tree.
> · Every instant/sorcery cast now carries a definite `castDuringMainPhase` stamp (CR 505.1); a copy strips it (CR 707.10), so its
>   Addendum never applies. The "you cast this spell during your main phase" reader answers only from that stamp (null otherwise),
>   so no generic conditional lane can admit the phrase. "Those creatures" is the grant's own fixed set (CR 611.2c) — the rider
>   never re-reads "creatures you control"; the counter rides the counter chokepoint (Hardened Scales). Witness
>   `unbreakableFormation.test.js` (14); `groupKeywordGrant.test.js`'s pin graduated (an Addendum with populate still parks).
> · ⚠️ Found, not fixed here (queued): Plunder the Trollshaws draws one, not two, when cast with flashback (a conditional's
>   context drops the cast-from-graveyard stamp); "creatures you control" scopes also take a bestowed Aura.

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 44: Champion of Lambholt (EDHREC #576) — the team self-power block gate · **+1** · corpus 15,434
> Suite **17,996** green (one run for P·44–46). Flip-diff **+1, −0, zero RETIERED**: Champion of Lambholt → native-trigger. Top 1,000 **872**;
> top 2,500 **1,709**. **Mutants 22/22**, restore byte-identical. Built by a fan-out builder; re-verified on the integrated tree.
> · "Creatures with power less than this creature's power can't block creatures you control." A blocking restriction (CR 509.1b) enforced
>   in canBlockAttacker — the one function every block path asks (the declare-blockers offer, the AI attack planner and block
>   chooser): each source the ATTACKER's controller controls applies independently, both powers read live (counters, pumps), the
>   source read through layer 1 (a Shifting Woodland copying the Champion carries it, CR 707.2). Equal power may block. One core
>   string builds the reader and the classifier mirror. Witness `championOfLambholt.test.js` (24); `selfPowerBlockGate.test.js`'s
>   "team form is not credited" pin re-pointed (graduated).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 43: Blasphemous Edict (EDHREC #509) — the N-count each-player edict as one simultaneous sacrifice · **+7** · corpus 15,433
> Suite **17,941** green (1 skipped); lint 0; decks **2,746** / 2,998 unchanged. Flip-diff **+7, −0, zero RETIERED**: Blasphemous Edict, Barter in
> Blood, Taste of Death, Tergrid's Shadow, Rankle's Prank → native-spell; Abyssal Gorestalker, Planar Collapse → native-trigger. Top 1,000
> **871**; top 2,500 **1,708**. **Mutants 30/30**, restore byte-identical. Built by a fan-out builder; re-verified on the integrated tree.
> · "Each player sacrifices <two..twenty> creatures [of their choice]": each player CHOOSES their own creatures in APNAP order (CR
>   101.4; each pick logged as made, 101.4b), a player with no more than they owe loses them all (CR 609.3), and nothing leaves until
>   the last choice — then one simultaneous sacrifice (sacrificeCreaturesTogether, the Living Death batch), so a Blood Artist sees
>   every death (CR 603.10a). The pool is layer-aware (an animated Mutavault is taken).
> · The trailing-condition alternative cost ("You may pay {B} rather than pay this spell's mana cost if there are thirteen or more
>   creatures on the battlefield") rides the trap form's reader and offer; the new global creature count reads every battlefield
>   layer-aware.
> · ⚑ Legality fix on the way (CR 118.9d): a fixed-mana alternative cost now pays the spell's static cost increases — the Bringers'
>   {W}{U}{B}{R}{G}, Fist of Suns and the Traps were offered untaxed under Thalia (cheaper than legal). Four pins that used "each
>   player sacrifices two creatures" as an unmodeled example re-pointed to the still-unmodeled each-opponent form.
>   Witness `blasphemousEdict.test.js` (23).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 42: Rise of the Dark Realms (EDHREC #492) — every graveyard's creature cards enter as one event · **+2** · corpus 15,426
> Suite **17,918** green (one run for P·40–42). Flip-diff **+2, −0, zero RETIERED**: Rise of the Dark Realms → native-spell, Liliana Vess
> → native-planeswalker (her −8 prints the same sentence; her +1 and −2 already parsed). Top 1,000 **870**; top 2,500 **1,707**.
> **Mutants 21/21**, restore byte-identical. Built by a fan-out builder; re-verified on the integrated tree.
> · "Put all creature cards from all graveyards onto the battlefield under your control." — a new non-targeted op reads every
>   graveyard at resolution (front face, CR 712.8a); each card enters under the caster's control and keeps its owner (CR 110.2,
>   400.3 — the opponent's Bears killed later goes to the opponent's graveyard). ONE event (CR 603.6a): enterCardsTogether places
>   every card before any enters trigger is checked, so a returning Soul Warden sees the others (enterCardFromZone gained
>   `deferEnterTriggers`; its three trigger checks moved, unchanged, into fireEnterTriggers).
> · ⚑ Behavior change on EVERY reanimation path (CR 603.10a): a graveyard watcher whose own card is in the same graveyard-event drain
>   answers for none of its events — a reanimated Tormod made a Zombie off its own return, a returned Syr Konrad pinged per card. It
>   only removes triggers. Witness `riseOfTheDarkRealms.test.js` (15).
> · ⚠️ Found, not fixed here (queued): enterCardFromZone skips a returning card's own entry replacements ("enters tapped",
>   "enters with counters" — Diregraf Ghoul comes back untapped); a declined commander return can strand after a reanimation.

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 41: Adeline, Resplendent Cathar (EDHREC #493) — the player-or-planeswalker token defender · **+1** · corpus 15,424
> Suite **17,918** green (one run for P·40–42). Flip-diff **+1, −0, zero RETIERED**: Adeline → native-mixed. Top 1,000 **869**; top 2,500
> **1,706**. **Mutants 13/13**, restore byte-identical. Built by a fan-out builder; re-verified on the integrated tree.
> · The per-opponent tapped-and-attacking arm (Endless Foot Assault) reads Adeline's "that player or a planeswalker they control"
>   with a house choice — the player, every time: an option the effect allows and always available (CR 508.4, 508.4a, 508.4c), so
>   an under-offer of the controller's options, never an illegal attack. The tokens are never declared, so no attack trigger fires
>   for them (CR 508.3a). The arm also carries its token's COLOR (CR 111.3): Adeline's Humans are white, Endless Foot Assault's
>   Ninjas black (its atom pin re-pointed). Witness `adelineResplendentCathar.test.js` (18) on a four-seat table: one trigger,
>   three tapped Humans, one per opponent, damage 5/1/1; an eliminated opponent gets none; Honor of the Pure pumps the Humans.
> · ⚠️ Found, not fixed here (queued): every OTHER create-token arm still mints a colorless token — a false positive where a color
>   matters (Doom Blade's "nonblack", protection from a color); attack triggers can resolve after a defender has blocked.

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 40: Massacre Wurm (EDHREC #512) — an opponent's dying creature drains its controller · **+1** · corpus 15,423
> Suite **17,918** green (1 skipped; one run for P·40–42); lint 0; decks **2,746** / 2,998 unchanged. CI GREEN on 39b (run 36966108512).
> Flip-diff **+1, −0, zero RETIERED** (9a055857 → the change): Massacre Wurm → native-trigger. Top 1,000 **868**; top 2,500 **1,705**.
> **Mutants 10/10**, restore byte-identical. Built by a fan-out builder (Opus 5.5, isolated worktree); re-verified on the integrated tree.
> · "Whenever a creature an opponent controls dies, that player loses 2 life." The watcher was detected; its payoff parked on "that
>   player". On the dies event with that scope, a clause that is exactly "that player loses N life" is rebuilt as the triggering
>   permanent's controller (the sentinel Blood Seeker's payoff uses) — the controller of the creature as it last existed (CR 603.10a,
>   608.2h), never its owner. The batch event, every other dies scope, an earlier antecedent and a trailing rider stay unrewritten.
>   Witness `massacreWurm.test.js` (15): the Wurm cast for real (its -2/-2 kills two Bears and a Doomed Traveler — three drains), a
>   four-seat pod drains each controller separately, Day of Judgment taking the Wurm with them still drains, a creature the user
>   stole drains nobody and the user's creature the AI stole drains the AI.

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 39b: Maskwood Nexus (EDHREC #490) — every creature type off the battlefield · **+1** · corpus 15,422
> Suite **17,870** green (1 skipped); lint 0; decks **2,746** / 2,998 unchanged. CI GREEN on 39a (run 36960594380).
> Flip-diff **+1, −0, zero RETIERED** (tier snapshots at e111439d → the change): Maskwood Nexus → native-mixed. Top 1,000 **867**;
> top 2,500 **1,704**. **Mutants 89/89**, restore byte-identical.
> · **The grant.** "Creatures you control are every creature type" is a DYNAMIC layer-4 `allCreatureTypes` effect (CR 613.1d) on the
>   creatures its controller controls — the derive applies it like 39a's fixed effects; effectiveTypeIdentity honors exactly that
>   printed selector (a plain controller read, no recursion) and turns away a noncreature (Maskwood itself — CR 205.3d).
> · **The zone half** — "the same is true for creature spells you control and creature cards you own that aren't on the battlefield" —
>   is a new leaf, `everyCreatureType.js` (cardIsEveryCreatureType: the Changeling keyword ability, or a creature card/spell whose
>   holder — the spell's controller, the card's owner — controls a Maskwood). Coverage strips that sentence only right after the grant.
>   Routed: the tutor filter (Goblin Matron's "a Goblin card"; Stoneforge's "an Equipment card" never), Kinnan's "non-Human creature
>   card" (NEGATED — it would put a Human onto the battlefield), the chosen-type digs and reveals (Icon of Ancestry, Herald's Horn,
>   Goblin Ringleader, For the Ancestors, Gishath), the graveyard filters (Overlord of the Balemurk's "non-Avatar" — NEGATED; Boggart
>   Birth Rite; Mantle of the Ancients' Aura/Equipment never), Return from Extinction's shared type, the cast triggers (Lys Alana
>   Huntmaster, Elder Pine, Elvish Handservant — the caster's Maskwood, not yours — Vanquisher's Banner, Rivaz's rider), the cost
>   reducers (Goblin Warchief, the Bannerets, Urza's Incubator, Edgewalker, Morophon; Hero of Iroas's Aura never), flash (Rattlechains;
>   Sigarda's Aid never), cast-from-top (Korlessa; Mystic Forge's artifact never), Vision's free Robot, Rivaz's graveyard cast, Root
>   Sliver, the spend restrictions (Cavern of Souls; Guidelight's artifact never) — offered AND paid — Path of Ancestry's shared type
>   (spell side, commander side, command zone or battlefield), the reveal costs and reveal lands (Silvergill Adept, Gilt-Leaf Palace; a
>   Snarl's Mountain never), the enters-with-counters statics (Bramblewood Paragon, CR 614.12), Essence Flux, the graveyard counts and
>   conditions (Vengeful Firebrand, Dawnhand Eulogist; Ramunap Hydra's and Desert's Hold's Desert never), the dies look-back (Headless
>   Rider). Every creature-type gate a non-creature word reaches is witnessed by a real card; the closed ones came out.
> · **Fixed on the way:** the fixed-type reveal (Merfolk Wayfinder "all Island cards", Elder Pine "all land cards") read creature
>   subtypes only, so it took no Island and no land — and took a changeling as an Island card; Overlord of the Balemurk could return a
>   changeling as a "non-Avatar" creature card; For the Ancestors could "choose" Equipment; changeling cards were not every creature
>   type in hands, libraries and graveyards (Goblin Matron, Boggart Birth Rite, Vengeful Firebrand missed them).
> · **Documented under-reads (the safe direction):** a copied spell's creature type for copy triggers (no printed copy trigger keys
>   on one); a subtype spell tax (none printed); "N or more <type> cards in your graveyard" counts (no creature-type printing); a
>   departed creature whose Maskwood left in the same event; Path of Ancestry between two every-type objects with no printed type.
>   Witness `app/src/lib/learn/everyCreatureTypeZones.test.js` (60; real-card fixtures generated from the bundled data — synthetic
>   only for three false-positive guards no printed card reaches yet: the zone-sentence anchoring, a non-creature reveal cost, a
>   typeless creature spell for Path of Ancestry).

> ## 🎯 2026-10-02 — PLAY-WEIGHTED · 39a: every creature type on the battlefield — Mirror Entity (EDHREC #995), Mutavault, Faceless Haven · **+3** · corpus 15,421
> Suite **17,810** green (1 skipped); lint 0; decks **2,746** / 2,998 unchanged. CI GREEN on the card-data refresh (run 36955366806).
> Flip-diff **+3, −0, zero RETIERED** (tier snapshots at e6fe84c8 → the change, the 10-01 data): Mirror Entity → native-activated;
> Mutavault (#1905), Faceless Haven → land. Top 1,000 **866** (+1); top 2,500 **1,703** (+2). **Mutants 78/78** (round 2 — see below).
> · **The half of #490 Maskwood Nexus that needs no zone.** A FIXED layer-4 `allCreatureTypes` effect (CR 613.1d) — Mutavault's "becomes
>   a 2/2 creature with all creature types" (Faceless Haven's "with vigilance and all creature types"), Mirror Entity's "gain all
>   creature types" (its team base-P/T set is layer-aware now: an animated Mutavault is a creature you control) — is the derive's
>   `everyCreatureType` flag, ordered against a "becomes the creature type of your choice" replacement by timestamp (CR 613.7), only
>   ever on a creature (CR 205.3d). layers.permIsEveryCreatureType reads it (+ Changeling, CR 702.73a); effectiveTypeIdentity reads it
>   recursion-free for the selectors and the layer-7 counts.
> · **Every battlefield creature-type reader asks it** — ~50 sites of the read-only reader inventory (~120 runtime sites in all; the
>   zone half — spells, hands, libraries, graveyards — is P·39b, Maskwood itself): lords and chosen-type anthems, party, the host-subtype
>   gate, Sliver Legion / Night Revelers / board-count gates, the trigger doubler, combat evasion, the group ward, the subtype triggers
>   (batch, attacks, combat damage, another-X-enters, Kindred Discovery, Paired Tactician, Toxin Sliver, Ceaseless Searblades), the
>   mass/team filters and tribal counts, "target Goblin" / "each non-Dragon", "Sacrifice a Goblin", Mjölnir's non-Villain, the
>   tap-a-Rebel / tap-a-Druid costs, Banner of Kinship, Champion, the Egg pool, amass, the conditions, Temple Altisaur, Calamity Bearer,
>   The Ur-Dragon. The NEGATED readers (non-Human, non-Wall, non-Dragon, non-Villain) are the load-bearing half — missing one acts
>   illegally. Documented under-reads (the safe direction): a departed permanent (a dies / sacrifice look-back) answers by its printed
>   Changeling only; Hero-only mana reads an activating source's printed type line.
> · **Existing changeling bugs fixed on the way:** "can't be blocked by Walls" (Juggernaut) let a changeling block; the "Vehicles /
>   Spacecraft …" selectors matched a changeling (every CREATURE type only, CR 205.3d); amass minted a second Army beside a changeling;
>   the tribal counts read a bare /changeling/ off the oracle, so Belonging, Springleaf Parade and Maskwood Nexus itself counted as
>   changelings. Changelings now also fire the another-X-enters / X-dies / X-attacks triggers and fill the counts.
> · **The gates, measured.** Round 1 (98 mutants) left 24 alive — 20 of them CR 205.3d gates at sites whose parsers only ever emit
>   creature types (a corpus-wide domain map showed it), so those came out as dead code; the gates a non-creature word DOES reach
>   (selector Spacecraft/Vehicle, trigger Swamp/Artifact, the Treasure sacrifice, the land/artifact counts and conditions, the
>   artifact-ability trigger) are witnessed by real cards: Captain Kirk, Aeronaut Admiral, Dread Presence, Arcbound Crusher,
>   Professional Face-Breaker, Lashwrithe, Magus of the Coffers, Thopter Spy Network, Reclusive Wight, Kurkesh, Yawning Fissure.
>   Witness `app/src/lib/learn/everyCreatureTypeBattlefield.test.js` (61; 64 real-card fixtures generated from the bundled data).
> · **Next:** P·39b — #490 Maskwood Nexus: its grant (a dynamic layer-4 effect on its controller's creatures) and the zone readers
>   (cast triggers, cost reducers, tutors, graveyard filters, the stack).

> ## 📦 2026-10-02 — CARD DATA: the Scryfall refresh 07-18 → 10-01 (The Hobbit, Reality Fracture) · corpus 15,253 → **15,418** (new cards) · top 1,000 868 → **865** (re-ranking)
> Suite **17,748** green (1 skipped); lint 0; decks **2,746** / 2,998 unchanged. CI GREEN on P·38 (run 36952367593).
> Omnath's [Q-ORACLE-SYNC] (Colton's ask), run between slices: P·39 (every creature type) parked as a patch at 76b26368, resumes on this data.
> · **Synced:** `npm run sync:oracle` (38,254 → 38,697 cards; 79,706 rulings; card-names.json 39,558 → 40,021 names: +710, −247 — 242
>   Arena-only Alchemy "A-" rebalances Scryfall's oracle export no longer carries, and 5 playtest/plane oddities); `generate:token-names`
>   (766 → 741: the new sets' tokens in, 51 names Scryfall's token search no longer returns out); the bulk sync into the roaming data root
>   (oracle_cards, default_cards, unique_artwork, rulings) + `build:oracle-index` (36,068 → 36,462) + `build:printings-index` (106,600).
>   New sets: HOB 188 · FRA 279 · FRC 83 (Jace, Multiverse Architect resolves). The main checkout's `app/data` oracle + rulings refreshed
>   byte-identical to the sync (Omnath's lookups read there); its tracked files untouched.
> · **Flip-diff** (tier snapshots at 76b26368, the 07-18 data → the 10-01 data): **GAINED 0, LOST 0, RETIERED 0**, new-to-index 591 — after
>   one fix: **Tato Farmer** fell native-mixed → body-only on the new data. Scryfall's 10-01 Oracle reads "onto the battlefield tapped under
>   your control" (07-18: "under your control tapped"); the matcher takes both orders now (zones.js). Witness `tatoFarmer.test.js` (+1: the
>   07-18 order parses to the same atom; the fixture carries the real {2}{G} now). **Mutants 2/2.** Without it the next release — every
>   release re-syncs its data — would have parked the card.
> · **The denominator step — data, not regression:** corpus **15,418 / 34,620** (44.5% either way) = +204 native among the 591 new cards,
>   −39 native among the 217 that left (216 A- rebalances · Fear (Not the Alpha One) // Loathing). Top 1,000 **865** (needs +35): the
>   membership moved with EDHREC's refreshed ranks, no card lost its tier — uncovered and now inside it: Raise the Palisade #888 · The Soul
>   Stone #912 · Evendo, Waking Haven #925 · Metallic Mimic #961 · Cut a Deal #978 · Approach of the Second Sun #979 · Cyberdrive Awakener #989;
>   uncovered and now outside it: Chatterfang, Squirrel General · Necromancy · Spellskite · Swarmyard. Top 2,500 **1,701** (was 1,694).
> · **Next:** P·39 resumes — #490 Maskwood Nexus is still the worklist head.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 38: the spell // spell modal-DFC lane — cast either face (Birgi, God of Storytelling #489) · **+1** · corpus 15,253
> Suite **17,747** green (1 skipped); lint 0; decks **2,746** / 2,998 unchanged. CI GREEN on P·37 (run 36951109708).
> Flip-diff **+1, −0, zero RETIERED** (tier snapshots at 78350425 → the change): Birgi, God of Storytelling // Harnfel, Horn of
> Bounty → native-mixed. Top 1,000 **868** (worklist: covered 868 / 1,000, +32 to 90%); top 2,500 **1,694**. **Mutants 8/8**.
> · **A modal DFC whose faces are both spells** (no land face — those stay parseModalDfc's land drop): CR 712.11b, the caster
>   chooses the face; CR 712.8f, on the stack and the battlefield it has only the characteristics of the face that's up.
>   modalDfc.parseSpellModalDfc / spellMdfcFaceCards project each face under the card's id (name, type, oracle, mana, mana
>   value, power/toughness). coverage credits the card only when BOTH faces are native on their own views. The shared cast
>   builder offers each face of a credited card in place of the combined card, so every cast lane that runs through it gets
>   both (witnessed: the hand, and the command zone with its tax); a face cast as a permanent carries the whole card as
>   printedCard (the V1 machinery), so the card that leaves the battlefield is the whole card.
>   Witness `app/src/lib/learn/spellModalDfc.test.js` (7).
> · **The lane's reach:** 40 spell // spell modal DFCs in the corpus; Birgi is the one with both faces native today. One face
>   away: Halvar, God of Battle #2379 (its front), Esika, God of the Tree #2509 (The Prismatic Bridge), Valentin, Dean of the
>   Vein (its front), Blex, Vexing Pest (Search for Blex).
> · **Next:** the worklist head, #490 Maskwood Nexus.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 37: the until-end-of-turn mana hold (Savage Ventmaw +2) and boast twice — Birgi's front · **+3** · corpus 15,252
> Suite **17,740** green (1 skipped); lint 0; decks **2,746** / 2,998 unchanged. CI GREEN on P·36 (run 36949781868).
> Flip-diff **+3, −0, zero RETIERED** (tier snapshots at 3274b547 → the change): Savage Ventmaw (#1636), Brazen Collector,
> Sakura-Tribe Springcaller → native-trigger. Top 1,000 **867** (unchanged — see below); top 2,500 **1,693**. **Mutants 9/9**.
> · **Aimed at #489 Birgi, God of Storytelling — whose card did NOT flip:** Birgi // Harnfel is a creature // artifact modal DFC,
>   and the engine casts neither face of one (coverage splits, and the runtime casts, only LAND-back MDFCs). Both of Birgi's
>   front lines are now modeled and witnessed on the front face's own view, ready for a spell // spell MDFC lane (the next slice).
> · **"Add <pips>. Until end of turn, you don't lose this mana as steps and phases end."** Plain pool mana (spendable on
>   anything — a boast cost included) plus an EXACT hold: gameState.holdManaUntilEndOfTurn → emptyManaPools keeps up to it at each
>   step/phase end; commitPaymentPlan clamps it to what is left of the color after every payment, so once the held mana is spent
>   a later red can't ride the hold (the firebending cap's documented imprecision does not carry over); cleanup drops it
>   (CR 514.2). splitClauses keeps the hold sentence with its add. Rejected on the way: Klauth's restricted entry (never
>   spendable on abilities) and the whole-color hold (keeps other sources' mana).
> · **Boast twice** (CR 702.135b): a marker + boastTwiceFor; the offer gate's limit is two for a boast while its controller has
>   it. "During each of your turns" needs no check — a boast is only ever offered on its creature's controller's turn.
>   Witness `app/src/lib/learn/birgi.test.js` (5).
> · **Next:** the spell // spell modal-DFC lane (cast either face) — it is what #489 Birgi needs, and the Kaldheim gods with it.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 36: Disciple of Freyalise (EDHREC #483) — sacrifice another, payoff by its power · **+1** · corpus 15,249
> Suite **17,735** green (1 skipped); lint 0; decks **2,746** / 2,998 unchanged. CI GREEN on P·35 (run 36948836775).
> Flip-diff **+1, −0, zero RETIERED** (tier snapshots at 1ff98c57 → the change): Disciple of Freyalise // Garden of Freyalise
> land-partial → native-trigger. Top 1,000 **867** (needs +33); top 2,500 **1,692**. **Mutants 5/5** (restore byte-identical).
> · "You may sacrifice another creature. If you do, you gain X life and draw X cards, where X is that creature's power." One
>   whole-effect matcher (removal.matchSacrificeAnotherForPower — Braids' shape): the controller's optional sacrifice of ANOTHER
>   creature (excludeSource), then two payoffs under the one "if you do": runProgram now carries the gate across consecutive
>   ifSacrificed atoms ("If you do, A and B"; no earlier program had two in a row). X is the sacrificed creature's last-known
>   power (CR 603.6e, counters included), recorded on its sacrifice log and read by the new count kind sacrificedThisWayPower —
>   never the cost channel Fling uses, which an effect sacrifice would leave stale for a later cost-less spell.
> · Two filters on that read (the sacrificer, a real victim) were seen-to-survive and REMOVED: the "if you do" gate already
>   guarantees the newest sacrifice entry is this one. Witness `app/src/lib/learn/discipleOfFreyalise.test.js` (6).
> · **Next:** #489 Birgi, God of Storytelling.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 35: Living Death (EDHREC #474) and Living End — the one-event batch sacrifice · **+2** · corpus 15,248
> Suite **17,729** green (1 skipped); lint 0; decks **2,746** / 2,998 unchanged. CI GREEN on P·34 (run 36947742150).
> Flip-diff **+2, −0, zero RETIERED** (tier snapshots at 0222fcf8 → the change): Living Death, Living End → native-spell.
> Top 1,000 **866** (needs +34); top 2,500 **1,691**. **Mutants 9/9** (restore byte-identical).
> · One atom (effects/atoms/livingDeath.js), three ordered steps (CR 608.2c): each player exiles the creature cards in their
>   graveyard (by the card's front face, CR 712.8a — Westvale Abbey stays) and the ids are kept per player; every creature on the
>   battlefield (layer-aware — an animated land goes) is sacrificed AS ONE EVENT; each player returns what THEY exiled this way
>   (zones.enterCardFromZone from exile; ETB triggers fire). A sacrifice, not a destroy (CR 701.21a): indestructible goes too.
> · New removal.sacrificeCreaturesTogether: sacrificeCreatureEffect's per-creature rules (the death-specific exile destination,
>   the exiled-instead flag, last-known power), but every look-back is read before any creature leaves, all move, and the dies
>   triggers fire ONCE for the batch — so Blood Artist sacrificed first still sees each of the others (P·34's look-back); the
>   sacrifice triggers fire per creature (Dragon Appeasement). With Rest in Peace out the sacrificed creatures are exiled instead
>   and never come back (they weren't exiled "this way"). Living End is really suspendable (its offer is witnessed).
>   Witness `app/src/lib/learn/livingDeath.test.js` (9).
> · **Next:** #483 Disciple of Freyalise.

> ## 🔧 2026-10-01 — P·34 FIX · CR 603.10a: a death watcher that dies with the creatures it watches still triggers for each · corpus 15,246 (runtime only)
> Suite **17,720** green (1 skipped); lint 0; decks 2,746 / 2,998 unchanged. CI GREEN on the [0.162.0] cut (run 36943811750).
> Flip-diff **±0** (a runtime fix: nothing's tier changes). **Mutants 4/4** (restore byte-identical).
> · **Found while scoping Living Death:** Blood Artist dying in the same board wipe (or combat trade) as two Bears drained ONCE —
>   for its own death — where its ruling (2016-06-08) and CR 603.10a say it triggers for each creature that died with it. Both
>   dies passes (checkDiesTriggers' singular sweep, checkDiesBatchTriggers) offered battlefield watchers only.
> · **The fix:** triggers.deadLookBackSources offers the batch's departed creatures as look-back sources (the same shape the self
>   fire and the orphaned-Aura look-back use), each to every OTHER death in the batch; one still on the battlefield stays the
>   sweep's (never twice). Witnessed: Day of Judgment with Blood Artist out (three drains), an SBA batch in either order, Zulaport
>   Cutthroat (your creatures only), Morbid Opportunist's once-a-turn batch draw, a self-only dies trigger not widened.
> · **Sim-data note:** before this, every board wipe or multi-creature combat death under an Aristocrats watcher under-counted
>   its triggers. Witness `app/src/lib/learn/deathLookBack.test.js` (6).
> · **Next:** #474 Living Death (its mass sacrifice rides this look-back).

> ## 🚀 2026-10-01 — v0.162.0 RELEASED · 50 commits since v0.161.0 · corpus 44.2% → 44.5% (15,246) · shelf 29 of 30 at ≥90
> The play-weighted batch (P·1–P·33, Colton's 10-01 program) crossed the ~100-card line: +101 since v0.161.0. Steps (RELEASE.md):
> the Node pin checked (v22.23.2 stays: v22 is LTS to 2027-04 and v22.23.3 is still a non-security patch, the v0.161.0 reading)
> · the Spellbook cache warm (the two 10-01 sync-spellbook runs green, no re-dispatch) · `[Unreleased]` → `[0.162.0] - 2026-10-01`
> (a5219303; CI 36943811750 green) · `git tag v0.162.0` on a5219303 + push · release run 36944797241 green (test ×2 + build) ·
> published 2026-10-02T00:46:20Z, marked Latest · `latest.json` verified BY CONTENT at the updater endpoint (version 0.162.0, a
> 420-character signature, the v0.162.0 installer URL). At the tag: top 1,000 **865** / 1,000, top 2,500 **1,690**, decks
> 2,746 / 2,998.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 33: Cabal Ritual (EDHREC #453) and Thermal Blast — the Threshold upgrade · **+2** · corpus 15,246
> Suite **17,714** green (1 skipped); lint 0; decks **2,746** / 2,998 unchanged. CI GREEN on P·32 (run 36941773639).
> Flip-diff **+2, −0, zero RETIERED** (tier snapshots at 3a739412 → the change): Cabal Ritual, Thermal Blast → native-spell.
> Top 1,000 **865** (needs +35); top 2,500 **1,690**. **Mutants 7/7** (restore byte-identical).
> · The instead-upgrade family (templateMatchers.matchInsteadAmountUpgrade) takes the THRESHOLD word: its canonical condition,
>   "there are seven or more cards in your graveyard", is read correctly now (interveningIf's untyped graveyard count, Cephalid
>   Coliseum's — YOUR graveyard, every card; checked on boards at six and seven). The family's note that Threshold was unreadable
>   was stale and is corrected; Descend stays out. Thermal Blast rides the existing burn family with it.
> · New ADD-MANA family: "Add <pips>. <word> — Add <pips> instead if <cond>" is two add-mana atoms on the same condition, the
>   base negated, so exactly one adds as the spell resolves (CR 608.2). The Ritual is on the stack as it resolves, so it never
>   counts toward its own threshold. A word over the wrong condition still parks (synthetic seen-to-fail).
>   Witness `app/src/lib/learn/cabalRitual.test.js` (5).
> · **Next:** cut v0.162.0 (the batch crossed 100), then #474 Living Death.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 32: Selvala, Heart of the Wilds (EDHREC #438) — its controller may draw if its power is the greatest · **+1** · corpus 15,244
> Suite **17,709** green (1 skipped); lint 0; decks 2,745 → **2,746** / 2,998 (Omnath, Locus of Mana 95 → 96). CI GREEN on P·31
> (run 36940430893). Flip-diff **+1, −0, zero RETIERED** (tier snapshots at bcba99f8 → the change): Selvala → native-mana. Top 1,000
> **864** (needs +36); top 2,500 **1,689**. **Mutants 10/10** (restore byte-identical).
> · The trigger's effect ("the triggering permanent's controller may draw a card if its power is greater than each other creature's
>   power") is one anchored arm (effects/atoms/misc.js): a draw for the ENTERING creature's controller (Fate Foretold's referent),
>   optional, with the "may" THAT player's (`optionalDecider`, beside Partner-with's override in runProgram; a decider who left
>   the game skips it, never the ability's controller), gated on a resolution-time condition (CR 608.2; the "if" sits inside the
>   effect). interveningIf reads it off the entering creature: layer-aware power strictly greater than every other CREATURE on every
>   battlefield (a tie is not greater; an uncrewed Vehicle doesn't count; a creature that left first can't be confirmed, FN-safe).
> · **Re-pointed pin (1):** manaTierPins.test.js — Selvala graduated from MUST_NOT_OVER-CLAIM to MUST_STAY_HIGH; Helga, Skittish
>   Seer keeps the trigger-beside-a-variable-X-add shape parked there.
>   Witness `app/src/lib/learn/selvala.test.js` (8).
> · **Next:** #453 Cabal Ritual.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 31: Silence (EDHREC #412) — your opponents can't cast spells this turn · **+1** · corpus 15,243
> Suite **17,700** green (1 skipped); lint 0; decks **2,745** / 2,998 unchanged. CI GREEN on P·30 (run 36939207926).
> Flip-diff **+1, −0, zero RETIERED** (tier snapshots at de0c998c → the change): Silence → native-spell. Top 1,000 **863**
> (needs +37); top 2,500 **1,688**. **Mutants 5/5** (restore byte-identical).
> · Permission Denied's turn-stamped cast lock (SHELF-85 S11, effects/atoms/misc.js) with the filter `all`: the shared cast
>   builder, the one source of every cast action (hand, graveyard, exile, command zone, free casts), refuses every card for a
>   locked seat this turn; the stamp self-expires with the turn. The controller is untouched; nothing but casting is locked.
> · **Fix (pre-existing):** the lock REPLACED a seat's existing same-turn lock, so an opponent's own Irencrag Feat limit ("only one
>   more spell this turn") vanished the moment Ranger-Captain of Eos or Permission Denied locked them, and they could cast past it.
>   It merges into a same-turn lock now; a lock from an earlier turn is spent and never merges.
> · **Re-pointed pin (1):** permissionDenied.test.js — its seen-to-fail "an unfiltered lock parks" graduated (pinned as Silence's
>   `all` filter); the creature-filtered lock still parks.
> · Still out: Mandate of Peace (its "cast only during combat" and "end the combat phase" lines).
>   Witness `app/src/lib/learn/silence.test.js` (3).
> · **Next:** #438 Selvala, Heart of the Wilds.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 30: Helm of the Host (EDHREC #396) and Followed Footsteps — a token copy of the creature it's attached to · **+2** · corpus 15,242
> Suite **17,696** green (1 skipped); lint 0; decks **2,745** / 2,998 unchanged. CI GREEN on P·29 (run 36937845077).
> Flip-diff **+2, −0, zero RETIERED** (tier snapshots at 7b32a760 → the change): Helm of the Host → native-mixed, Followed
> Footsteps → native-trigger. Top 1,000 **862** (needs +38); top 2,500 **1,687**. **Mutants 8/8** (restore byte-identical).
> · The token-copy anchor (effects/atoms/tokenCopy.js) reads "a copy of EQUIPPED creature" and "a copy of ENCHANTED creature" as
>   the creature the source is attached to: the `attached` referent Springheart Nantuko's copy already reads, live at resolution, so
>   an unattached Helm makes nothing (CR 111.12). Helm's ", except the token isn't legendary" rides the existing strip (CR 707.9b),
>   so the copy of a legend survives the legend rule (CR 704.5j); "That token gains haste" is the existing minted-token haste fold
>   (a lasting grant, CR 611.2a), so the copy attacks the turn it is made (CR 702.10b).
> · Witnessed from the engine's own step machine (advanceStep → runStepActions): the beginning of combat on your turn (Helm),
>   not on an opponent's; your upkeep (Followed Footsteps). Still out: Endless Evil (its "except the token is 1/1" rider).
> · **Re-pointed pin (1):** auraOwnTriggered.test.js — Followed Footsteps was the "an unrouted effect still parks the whole
>   card" fixture; it graduated (pinned as such), and Endless Evil's upkeep copy holds the park guarantee.
>   Witness `app/src/lib/learn/helmOfTheHost.test.js` (4).
> · **Next:** #412 Silence.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 29: Underworld Breach (EDHREC #388) — escape, granted · **+1** · corpus 15,240
> Suite **17,691** green (1 skipped); lint 0; decks **2,745** / 2,998 unchanged. CI GREEN on P·28 (run 36935325362).
> Flip-diff **+1, −0, zero RETIERED** (tier snapshots at 97918e7c → the change): Underworld Breach → native-mixed. Top 1,000
> **861** (needs +39); top 2,500 **1,686**. **Mutants 24/24** (restore byte-identical).
> · **The grant (CR 702.138a):** "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost
>   plus exile three other cards from your graveyard." Two markers paired on one permanent (the Citadel pattern), read by
>   staticAbilityParser.escapeGrantsFor; The Master of Keys' enchantment form parses too (its ETB still parks it).
> · **The cast:** legalChoices.actionsCastEscapeFromGraveyard runs each covered graveyard card through the shared builder from the
>   graveyard: its mana cost (every reduction and tax), its additional costs, its normal timing. Escape is an alternative cost, so
>   the builder's bestow and emerge casts of the card are dropped (CR 601.2b); a costless card stays unpayable (CR 118.6, the
>   builder's own gate). The three exiled cards are frozen at the offer by the least-valuable policy every count-of-N cost uses,
>   never a card the spell targets, and named on the action and its label ("escape: exile …"); the dispatcher exiles them as the
>   cost and refuses a stale offer.
> · **Where it goes:** an escaped instant or sorcery goes back to the graveyard (escape, unlike flashback, does not exile it), so it
>   can escape again; an escaped permanent carries `escaped` (CR 702.138b), the flag the Theros titans' "sacrifice it unless it
>   escaped" has read since stage ③ · 17, through the cast resolver and a Clone's copy. Uro, escaped through Breach, stays.
> · Not offered (safe FNs): a card's own PRINTED escape (coverage's ESCAPE_LINE strip stands); a card with an "escapes with" rider
>   (CR 702.138c/d, unmodelled, 12 cards); split, adventure and modal DFC cards (the builder casts their faces from the hand only).
>   The exiled three are the policy's pick; a human cannot choose another three (an under-offer).
> · Re-pointed header: sacrificeUnlessEscaped.test.js (its "future escape cast" arrived). Witness
>   `app/src/lib/learn/underworldBreach.test.js` (11) + castVariantLabel.test.jsx (the label).
> · **Next:** #396 Helm of the Host.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 28: Dauthi Voidwalker (EDHREC #384) — the void-counter exile and its free play · **+1** · corpus 15,239
> Suite **17,679** green (1 skipped); lint 0; decks **2,745** / 2,998 (Nekusar Wheels 90 → 91). CI GREEN on P·27 (run 36932054130).
> Flip-diff **+1, −0, zero RETIERED** (tier snapshots at 5afef949 → the change): Dauthi Voidwalker → native-mixed. Top 1,000
> **860** (needs +40); top 2,500 **1,685**. **Mutants 46/46** (restore byte-identical).
> · **The replacement, void-counter form:** "If a card would be put into an opponent's graveyard from anywhere, instead exile it
>   with a void counter on it" is P·27's marker with `voidCounter`, and every road P·27 built stamps the counter: moveCardToZone's
>   redirect, a resolved spell, a countered spell, mill / surveil / a dig, and every death site. With a plain exile also applying
>   (Rest in Peace, or a death-specific one like Lava Coil's) the owner picks the plain one (CR 616.1): no counter.
> · **Death sites, destination split:** destroy, lethal damage, sacrifice and the legend rule take their DESTINATION from the
>   death-specific exiles only (gameState.deathExiledInstead — Lava Coil's stamp, the damage-source and Stone of Erech statics). A
>   graveyard-bound card's exile-instead happens in moveCardToZone's redirect, the one place that puts the counter on (for a stolen
>   creature, in its OWNER's exile). Whether it died still reads both (diesExiledInstead).
> · **The counter is on the card in exile:** a card leaving exile (any move, or a cast from exile) loses it (CR 400.7).
> · **The ability:** one atom, void-play-grant. The candidates are void-countered cards your opponents own; one is granted
>   directly, two or more pause through the milled-pick (toZone "playFree"; nonlands first, then highest mana value, which is the
>   autopilot's pick). The grant is Ragavan's cross-player exile stamp plus `_impulseFree`, for this turn; the exile lane offers such
>   a card free and ONLY free (the permission is to play it without paying its mana cost). The settler re-validates the pick
>   (CR 608.2b); a chooser who left the game gets nothing, and a departed owner's card falls through (CR 800.4a).
> · **UI fix (pre-existing):** the milled-pick's `toZone` never crossed the wire (decisionWire's whitelist), so the "Exile a card
>   from your graveyard" heading (Relic of Progenitus, Scrabbling Claws, Graveyard Shovel, Merrow Bonegnawer) always read "Take a
>   card?". Whitelisted; the free-play heading rides the same field.
> · Residue: a chosen LAND is not offered (the cross-player lane casts only; an under-offer, FN). Noted, not fixed (pre-existing):
>   the death-site logs misreport a creature that shuffles into its library instead (the narrator and the combat-trade analysis
>   read them; the dies triggers do not). Witness `app/src/lib/learn/dauthiVoidwalker.test.js` (15).
> · **Next:** #388 Underworld Breach.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 27: Rest in Peace (EDHREC #2288) and Leyline of the Void — a graveyard-bound card is exiled instead · **+2** · corpus 15,238
> Suite **17,664** green (1 skipped); lint 0; decks **2,744** / 2,998 unchanged. CI GREEN on P·26 (run 36929800272).
> Flip-diff **+2, −0, zero RETIERED** (tier snapshots at c3f5bddf → the change): Rest in Peace → native-mixed, Leyline of the
> Void → native-static. Top 1,000 **859** (unchanged — this is the system #384 Dauthi Voidwalker needs, next); top 2,500
> **1,684**. **Mutants 15/15** (restore byte-identical).
> · **The replacement (CR 614.1a):** "If a card [or token] would be put into <a | your | an opponent's> graveyard from anywhere,
>   exile it instead." One marker in the static parser (the classifier and the runtime read the same thing) and one board
>   reader, gameState.graveyardExiledFor: the card's OWNER's graveyard (CR 400.3), "your" / "an opponent's" relative to the
>   replacement's controller, a token only for "card or token" (CR 111.1).
> · **Every road into a graveyard honours it** — the reason this is a system, not a card: moveCardToZone (discard, a destroyed
>   artifact, the bulk of the moves; applied before the move, beside Darksteel Colossus's shuffle-instead, so no graveyard
>   event or creature-card stamp records a card that never arrived), a resolved spell (after the self-shuffle — Green Sun's
>   Zenith still shuffles), a countered spell, mill (still a milled card, CR 701.17c), surveil, a graveyard-disposing dig, and
>   every death site through diesExiledInstead: a creature exiled instead never died (CR 700.4) — no dies trigger, no death
>   tally — and neither did a planeswalker (its watchers read where the card went).
> · **Witnessed per road** (13 tests): destroy, lethal damage, sacrifice, an artifact, a discard, a resolved and a countered
>   spell, mill, surveil, a dig, a token creature, a planeswalker and a token planeswalker; Leyline's opponents-only and
>   cards-only scope; a stolen artifact going to its OWNER's graveyard; "your graveyard" on a synthetic card.
> · **Re-pointed pin (1):** leylineOpeningHand.test.js — Leyline of the Void was the "opening-hand strip doesn't hide an
>   unmodeled static" example; it graduated, and the guard now holds on Leyline of the Guildpact's all-colours static.
> · Still out: Necrodominance, Festival of Embers, Forbidden Crypt, Yawgmoth's Agenda (their other lines); Yawgmoth's Will and
>   Gaea's Will (the this-turn spell form). Witness `app/src/lib/learn/restInPeace.test.js` (13).
> · **Next:** #384 Dauthi Voidwalker (the void-counter form of this replacement, and its sacrifice ability).

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 26: Shifting Woodland (EDHREC #362) — a copy of a graveyard card, and a copy's mana · **+1** · corpus 15,236
> Suite **17,651** green (1 skipped); lint 0; decks 2,740 → **2,744** / 2,998 (92%: cdh 95, Squirrel Girl 94, Earth Bent 93,
> Shalai and Hallar Test 91). CI GREEN on P·25 (run 36928376606).
> Flip-diff **+1, −0, zero RETIERED** (tier snapshots at aa304340 → the change): Shifting Woodland land-partial → land. Top 1,000
> **859** (needs +41); top 2,500 **1,683**. **Mutants 7/7** (restore byte-identical).
> · **The copy:** the become-copy seam took only permanents on the battlefield; "target permanent card in your graveyard" is
>   now a target noun (the reanimate family's graveyard target), and the resolver copies the card itself — gone from that
>   graveyard before it resolves → nothing (CR 608.2b). The delirium gate was already readable.
> · **The bug it surfaced (live since Thespian's Stage shipped):** manaSources read every permanent's PRINTED card, so a
>   permanent that BECAME a copy kept its printed mana — a Stage that became a Forest tapped for {C} or {G}, one that became
>   a Bear still tapped for {C}. It now reads the copy (CR 707.2, 613.1a) through deriveCharacteristics, which owns which copy
>   wins; the tapped-source check reads it too (a tapped Crawler that became a Forest is a tapped Forest).
> · **The one read that stays printed, on purpose:** the summoning-sickness choice. A printed creature trusts its stamped flag;
>   everything else goes through the layer-aware summoningSickNow, which is what sees a land played this turn that became a
>   creature copy (Woodland as Llanowar Elves can't tap that turn — CR 302.6). Reading the copy there let it tap; the
>   witness caught it before it shipped.
> · **Runtime:** `WITNESS shiftingWoodland` — Woodland becomes a 6/4 Craw Wurm that taps for nothing, and is a Forest-tapping
>   land again next turn. Witness `app/src/lib/learn/shiftingWoodland.test.js` (8).
> · **Next:** #384 Dauthi Voidwalker.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 25: Dawn's Truce (EDHREC #359) — you and your permanents gain hexproof · **+2** · corpus 15,235
> Suite **17,643** green (1 skipped); lint 0; decks **2,740** / 2,998 unchanged. CI GREEN on P·24 (run 36926934945).
> Flip-diff **+2, −0, zero RETIERED** (tier snapshots at 8ec5e0c7 → the change): Dawn's Truce, Lazotep Plating → native-spell.
> Top 1,000 **858** (needs +42); top 2,500 **1,682**. **Mutants 5/5** (restore byte-identical).
> · **The form:** Veil of Summer's "hexproof from <colours>" machinery with a null colour list — plain hexproof (CR
>   702.11c/d): a player stamp for the turn and a target shield fixed to the permanents the controller has as it resolves
>   (CR 611.2c), both refusing EVERY opponent source, colourless included. The controller may still target their own.
>   splitClauses keeps the plain sentence whole, as it already kept Veil's.
> · **The gift:** an optional additional cost the engine never pays (castModifiers.stripGiftPromise), so "if the gift was
>   promised, … indestructible" never applies — the un-promised spell is the whole real mode.
> · Still out: Surge of Salvation (its colour-sourced damage prevention), Earthshape / Blossoming Calm ("You gain hexproof"
>   alone, and until your next turn).
> · **Runtime:** `WITNESS dawnsTruce` — after it resolves, a red or colourless opponent source can't target you or your Bear;
>   you still can; the opponent's side is untouched. Witness `app/src/lib/learn/dawnsTruce.test.js` (4).
> · **Next:** #362 Shifting Woodland.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 24: Anger (EDHREC #349) and the Incarnations — statics that work from a graveyard · **+5** · corpus 15,233
> Suite **17,639** green (1 skipped); lint 0; decks **2,740** / 2,998 unchanged. CI GREEN on P·23 (run 36925379460).
> Flip-diff **+5, −0, zero RETIERED** (tier snapshots at 103f20f5 → the change): Anger, Wonder, Brawn, Filth, Valor →
> native-static. Top 1,000 **857** (+2 — Wonder #821 with Anger; needs +43); top 2,500 **1,681** (+3 with Brawn #1876).
> **Mutants 8/8** (restore byte-identical).
> · **The seam:** "As long as this card is in your graveyard and <condition>, <effect>" functions only from a graveyard
>   (CR 113.6b). The ONE clause reader (staticAbilityParser.parseClause — so the runtime and the classifier read the same
>   thing) peels the graveyard clause, parses the rest as the gated anthem it already read ("as long as you control a
>   Mountain, creatures you control have haste"), and tags it `zone:"graveyard"`. layers.staticEffectsOf drops it on the
>   battlefield; the new layers.graveyardEffectsOf collects it from each graveyard.
> · **Whose "you":** a card in a graveyard has no controller, so "you" is its owner (CR 109.5). The effect's source is
>   `{ kind: "graveyard", controller: owner }`, read by the selector (as an emblem's is) and by the source gate (the "you
>   control a Mountain" count runs on the owner's board). An ordinary anthem in a graveyard still does nothing (witnessed).
> · **Residue:** the gate's board count reads printed type lines (layer-internal, recursion-free by design), so a Dryad
>   player's granted Mountain doesn't open Anger's gate — an under-read, the safe direction; it's in the type-line audit task.
> · **Runtime:** with Anger in your graveyard and a Mountain out, a creature that entered this turn is offered as an
>   attacker; Anger on the battlefield grants nothing. Witness `app/src/lib/learn/incarnations.test.js` (7).
> · **Next:** #359 Dawn's Truce.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 23: Sevinne's Reclamation (EDHREC #339) — cast from a graveyard, and the self-copy · **+1** · corpus 15,228
> Suite **17,632** green (1 skipped); lint 0; decks **2,740** / 2,998 unchanged. CI GREEN on P·22 (run 36922846707).
> Flip-diff **+1, −0, zero RETIERED** (tier snapshots at 7f6cfccf → the change): Sevinne's Reclamation → native-spell. Top 1,000
> **855** (needs +45); top 2,500 **1,678**. **Mutants 16/16** (restore byte-identical).
> · **The seam (a 14-card family):** "if this spell was cast from a graveyard" is a cast-time fact. applyCastSpell stamps
>   `params.context.castFromGraveyard` on a graveyard cast (it rides every resume), and the condition reader answers it
>   definitely — an unstamped spell was cast from elsewhere, or is a copy. The rest of the family waits on its own halves
>   (the Increasing cycle's "… instead" behind reminder text, Ruthless Negotiation's exile-from-hand).
> · **The copy:** an optional `copy-self-spell` gated on that read puts ONE copy of the resolving spell on the stack. Its
>   program is the reanimate (a copy is never cast, so its own copy sentence could never fire — CR 707.10), and it re-picks
>   its target off the live board through the storm copies' picker (now a shared helper). With no other legal card it keeps
>   the original's target, which fizzles (CR 608.2b). Magecraft sees it. The copy's target is picked for the player, as storm
>   copies' are.
> · **Copies are never cast — and the bug that surfaced:** every copy site now clones through `spellCopyPayload`, which
>   strips the cast-time facts. The instant/sorcery copy (Reverberate, Twincast, Flare of Duplication) kept the original's
>   graveyard disposition, so a resolved copy put a SECOND object with the original card's id into the graveyard. Fixed,
>   and witnessed with a cast Lightning Bolt.
> · **Infrastructure:** RESOLVER_KEYS moved to a zero-import leaf (`resolverKeys.js`, re-exported by resolvers.js) so an atom
>   can build a fresh effect-program payload without the resolvers → runProgram → effectAtoms cycle.
> · **Runtime:** `WITNESS sevinneFlashback` — flashback returns Sol Ring, the copy is offered, and taken it returns Grizzly
>   Bears; Craw Wurm (MV 6) is never a target; Sevinne's is exiled. Witness `app/src/lib/learn/sevinnesReclamation.test.js` (11).
> · **Next:** #349 Anger.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 22: Mana Geyser (EDHREC #304) — the ritual per count · **+9** · corpus 15,227
> Suite **17,621** green (1 skipped); lint 0; decks **2,740** / 2,998 unchanged. CI GREEN on P·21 (run 36921436640).
> Flip-diff **+9, −0, zero RETIERED** (tier snapshots at 774cc747 → the change): Mana Geyser, Battle Hymn, Songs of the Damned,
> Brightstone Ritual, Inner Fire, Dragon's Desire → native-spell; Black Market, Giant-Man, Gargantuan Genius → native-trigger;
> Altar of Shadows → native-mixed. Top 1,000 **854** (+2 — Black Market #659 rode along; needs +46); top 2,500 **1,677** (+3 with
> Battle Hymn #1654). **Mutants 7/7** (restore byte-identical).
> · **The arm:** "add {C} for each <count>" reads ANY count the shared count-source parser reads (opponent scopes and
>   battlefield-wide counts included), counted at resolution (CR 608.2h) through the manaPerCount path Rite of Flame already
>   used. A count keyed on a player the atom never targets ("that player", "they") is refused — with no target it would
>   count nothing. Every flip was read: the three first-main-phase triggers are the same clause (Black Market and Altar of
>   Shadows count their own charge counters; Giant-Man counts creatures with power 4 or greater, layer-aware).
> · **New count:** "tapped <type> your opponents control" — the opponents sum now honours the tapped qualifier the
>   controller-scoped count already had.
> · Still out: Rousing Refrain (its keep-the-mana rider and suspend), Dragonrage ("attacking creature you control" is not a
>   count yet), Mana Flair (an artist choice).
> · **Runtime:** `WITNESS ritualFamily` — Battle Hymn 3 (three creatures), Songs of the Damned 2, Brightstone Ritual 3 (Goblins
>   on both sides), Inner Fire 4, Dragon's Desire 2; Mana Geyser counts the 3 tapped of an opponent's 5 lands, and sums a pod.
>   Witness `app/src/lib/learn/ritualPerCount.test.js` (6).
> · **Next:** #339 Sevinne's Reclamation.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 21: Dryad of the Ilysian Grove (EDHREC #295) — every basic land type · **+2** · corpus 15,218
> Suite **17,615** green (1 skipped); lint 0; decks **2,740** / 2,998 unchanged. CI GREEN on P·20 (run 36919125569).
> Flip-diff **+2, −0, zero RETIERED** (tier snapshots at 513db9fc → the change): Dryad of the Ilysian Grove, Prismatic Omen →
> native-static. Top 1,000 **852** (needs +48); top 2,500 **1,674**. **Mutants 8/8** (restore byte-identical).
> · **The static:** "Lands you control are every basic land type in addition to their other types" is the controller-scoped,
>   all-five cousin of Urborg's each-land arm — a layer-4 add of Plains, Island, Swamp, Mountain and Forest on each land its
>   controller controls (CR 305.6, 205.1b). The intrinsic mana rides the existing manaModel delivery: two Forests cast {U}{U}
>   while the Dryad is out, one tap still makes one mana, and an opponent's lands are untouched.
> · **The bug it surfaced (live since Urborg shipped):** the land-type readers matched the PRINTED type line, so a granted
>   type was invisible to them. Landwalk (CR 702.14c) let a defender whose lands had become Islands block an islandwalker
>   (an illegal block); "can't attack unless defending player controls an Island" refused a legal attack; and "When you
>   control no Islands, sacrifice this creature" (11 native carriers — Sea Serpent, Dandân, Barbarian Outcast, Gorilla
>   Pack…) would sacrifice a creature whose controller does control one. combatEvasion.defenderControlsLandType and
>   interveningIf.permMatchesFilter now read the derived subtypes beside the printed line (which still answers "snow land").
>   One-way edge: interveningIf → layers; layers.js never evaluates conditions, so no derive recursion.
> · **Residue, flagged as its own task:** the card-type half of the condition filter (an animated land as a creature), the
>   non-<type> target restrictions, and the layer-internal counts (printed by design — a derive inside a derive would
>   recurse; those under-count, the safe direction).
> · Leyline of the Guildpact prints the same line; its "each nonland permanent you control is all colors" still holds it back.
> · **Re-pointed pin (1):** extraLandDrops.test.js — Dryad was the "type-changing rider stays non-native" example; it
>   graduated, and the boundary now sits on the single-type cousin ("Lands you control are Swamps…"), still unmodeled.
> · **Runtime:** `WITNESS dryadMana` — a Dryad player's Forest is all five types and taps for WUBRG; Blast Zone taps for {C} or any
>   colour; the opponent's Mountain stays a Mountain. Witness `app/src/lib/learn/dryadOfTheIlysianGrove.test.js` (6).
> · **Next:** #304 Mana Geyser.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 20: Braids, Arisen Nightmare (EDHREC #291) — the shares-a-card-type edict · **+1** · corpus 15,216
> Suite **17,609** green (1 skipped); lint 0; decks **2,740** / 2,998 unchanged. CI GREEN on P·19 (run 36914337640).
> Flip-diff **+1, −0, zero RETIERED** (tier snapshots at 103f2554 → the change): Braids, Arisen Nightmare → native-trigger. Top
> 1,000 **851** (needs +49); top 2,500 **1,673**. **Mutants 31/31** (restore byte-identical).
> · **The model:** two atoms — the controller's OPTIONAL sacrifice from a new five-type pool (`nonbattlePermanent`: artifact,
>   creature, enchantment, land, planeswalker; never a battle), then `edict-shares-type`, gated `ifSacrificed`. The payoff is
>   Torment of Hailfire's edict chain with a spec: each opponent may sacrifice a permanent sharing a card type with the
>   sacrificed one, or loses 2 while Braids' controller draws; no discard mode. With no spec the chain is Torment's, unchanged.
> · **Card types as it left (CR 608.2h):** the sacrifice log now carries the sacrificed permanent's card types, read layer-aware
>   before it moves (an animated land leaves as a Land Creature) and filtered to the CR 205.2a card types — the derived type list
>   also holds supertypes, and a sacrificed Legendary Creature must not let an opponent answer with a Legendary Enchantment (CR
>   205.4a). Each opponent's pool reads its permanents' live types the same way.
> · **The settle gap it closed:** no optional sacrifice had ever preceded an `ifSacrificed` atom, so a taken "you may sacrifice"
>   that went inline (a sole candidate) had no way to report it — only a paused pick (resolveSacrificeChoice) did.
>   resolveOptionalChoice now reads the predicate runEffectProgram uses (`realSacrificeIn`, one shared read; its no-victim
>   exclusion had no witness anywhere, Victimize included — it has one now).
> · **AI:** opponents keep Torment's rule against the printed 2 (they sacrifice only at 2 life or less); an AI Braids always takes
>   the sacrifice (the legacy optional default) and gives up its least valuable permanent. The edict picker shows the spec
>   ("Lose 2 life — its controller draws a card"; the shares-a-type pool) and the optional prompt names the sacrifice.
> · **Runtime:** `WITNESS braidsPod` — ai1 kept its Bear and lost 2, ai2 (nothing to share) was forced to lose 2, ai3 sacrificed;
>   Braids' controller drew 2. Witness `app/src/lib/learn/braidsArisenNightmare.test.js` (18).
> · **Next:** #295 Dryad of the Ilysian Grove.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 19: Reality Shift (EDHREC #273) — a manifest can be turned face up · **+5 / −10** · corpus 15,215
> Suite **17,591** green (1 skipped); lint 0; decks 2,739 → **2,740** / 2,998 (Did you say Dragons? 92). CI GREEN on P·18 (run 36910711803).
> Flip-diff **+5, −10 (every LOST understood, below), zero RETIERED** (tier snapshots at 40554e9b → the change): Reality Shift, Soul
> Summons → native-spell; Sultai Emissary, Soul-Strike Technique → native-trigger; Qarsi High Priest → native-activated. Top 1,000
> **850** (needs +50); top 2,500 **1,672** — no lost card ranks inside either. **Mutants 17/17** (restore byte-identical).
> · **Why Reality Shift needed more than a rider:** it manifests for the OPPONENT. With no way to turn a manifest face up their
>   creature card would stay a 2/2 forever — a stronger card than printed, the forbidden direction. So the slice builds the
>   CR 701.40b special action: any time its controller has priority, a manifested CREATURE card turns face up for its mana
>   cost (`turn-face-up` — legalChoices.actionsTurnManifestFaceUp, actionDispatcher.applyTurnFaceUp): the same permanent,
>   counters/damage/effects kept and nothing entering (CR 708.8); an instant or sorcery stays down (701.40g); no mana cost is
>   unpayable (118.6); the lethal check runs after. The AI flips one bigger than the 2/2 on its main phase. Manifest dread
>   played as a vanilla 2/2 until now — it can flip too.
> · **The rider:** "Its controller manifests the top card of their library" is a removal controller-rider (the Path to Exile
>   capture); "Manifest the top card of your library" (Soul Summons, Sultai Emissary, Qarsi High Priest) parses too.
> · **LOST 10, all honest:** coverage's TURNED_FACE_UP strip credited every "…is turned face up" trigger as unreachable because
>   nothing ever flipped. Something does now. The strip is narrowed to a card's OWN flip trigger ("When this creature is turned
>   face up" — still unreachable, because the turn-up is WITHHELD for a manifested card carrying one: one pattern,
>   `hasSelfTurnedFaceUpTrigger`, shared by the strip and the offer). WATCHERS of other permanents' flips are reachable and
>   unmodeled, so they are residue: Deathmist Raptor, Aven Farseer, Bonethorn Valesk, Aphetto Runecaster, Salt Road Ambushers,
>   Pine Walker, Experiment Twelve, Sumala Sentry, Pyrotechnic Performer, Unblinking Bleb → body-only (Mastery of the Unseen and
>   Trail of Mystery stay there too). Modeling the watcher event is flagged as its own task.
> · **Re-pointed pins (2):** opponentAI.castDiscipline.test.js — Reality Shift was AI-F2's "unresolvable, hold it" example;
>   native now, its row is retired (the Teferi's Protection precedent) and re-pointed: offered targeted, the policies agree.
>   mvFilteredRemoval.test.js — it was an "unmodeled rider" refusal; asserted native now, Prismatic Ending and March of
>   Otherworldly Light hold the refusal.
> · **Runtime:** `WITNESS realityShift {"exiled":["Grizzly Bears"],"faceDown":{"name":"","size":[2,2],"real":"Craw Wurm"},
>   "library":0}`; turned up for {4}{G}{G} the manifest is Craw Wurm 7/5 with its +1/+1 counter kept; a damaged 2/2 turned into
>   a 1/1 dies. Witness `app/src/lib/learn/realityShift.test.js` (12).
> · **Next:** #291 Braids, Arisen Nightmare.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 18: Hullbreaker Horror (EDHREC #269) — "choose up to one" and the spell-only bounce · **+4** · corpus 15,220
> Suite **17,579** green (1 skipped); lint 0; decks 2,738 → **2,739** / 2,998 (Kinnan 92). CI GREEN on P·17 (run 36909086278). Flip-diff
> **+4, zero LOST, zero RETIERED** (tier snapshots at 099bdd66 → the change; each full oracle audited): Hullbreaker Horror →
> native-mixed; Dreamshackle Geist (and its Alchemy twin), Sawblade Slinger → native-trigger. Top 1,000 **849** (needs +51); top
> 2,500 **1,671**. **Mutants 6/6** (restore byte-identical).
> · **"Choose up to one —"** (parseModal): its own anchored lead (every existing modal byte-identical), carried as
>   `allowNone`. A modal trigger's chooser aims each mode at the enemy side; with `allowNone`, finding no safe candidate means
>   choosing NO mode — the ability is removed from the stack (CR 603.3c) instead of going to the Arbiter, and never bounces
>   your own permanent.
> · **The spell-only bounce:** "return target spell you don't control to its owner's hand" — Venser's stack half alone
>   (targetType "spell"), narrowed to another player's spell (`spellController`), not a counter (`notCounter`, CR 701.6a) so
>   an uncounterable spell is still a legal target. The enumeration's own refusal of your spell is witnessed directly — the
>   trigger's chooser would have hidden its absence.
> · **Runtime:** `WITNESS hullbreakerHorror {"stack":["Dark Ritual"],"aiHand":["Divination"],"ogre":true}` — the opponent's
>   Divination returned to their hand when the Ritual was cast; with no spell their nonland permanent goes; with nothing of
>   theirs the trigger is removed and Hullbreaker stays; Carnage Tyrant on the stack is bounced. Witness
>   `app/src/lib/learn/hullbreakerHorror.test.js` (7).
> · **Next:** #273 Reality Shift.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 17: Bolas's Citadel (EDHREC #263) — pay life from the top, and "Sacrifice N <class>" costs · **+15** · corpus 15,216
> Suite **17,572** green (1 skipped); lint 0; decks 2,735 → **2,738** / 2,998 (Vihaan 96, Shorikai Vehicles 92, Thrun Voltron 92). CI
> GREEN on P·16 (run 36905650413). Flip-diff **+15, zero LOST, zero RETIERED** (tier snapshots at ca807be9 → the change; each full oracle
> audited): Bolas's Citadel, Sai, Master Thopterist, Mondrak, Glory Dominus, Zopandrel, Breya, Turntimber Sower, Scion of Opulence,
> Hedron Detonator → native-mixed; Time Sieve, Whisper, Krark-Clan Engineers, Keldon Arsonist, Eater of Hope, Keskit, Tooth and
> Claw → native-activated. Top 1,000 **848** (needs +52; Citadel #263, Mondrak #422, Sai #813); top 2,500 **1,670**. **Mutants 16/16**.
> · **FIXED — a runtime false positive on a body-only card:** the static parser read Citadel's "You may play lands and cast
>   spells from the top of your library" and dropped the next sentence, "If you cast a spell this way, pay life equal to its mana
>   value rather than pay its mana cost" — so a Citadel in play let the top card be cast paying MANA. The rider is a marker now
>   (`playFromTopPaysLife`); playFromTopPermission pairs it with the permission on the same card and makes that card's spell
>   grant a life-cost one (`lifeSpellFilter`) — its lands are unchanged, and beside Future Sight both ways are offered.
> · **The life-cost cast (CR 118.9):** built as a no-mana cast (X is 0 — CR 107.3b; no second alternative cost — 118.9a) carried
>   as an `altCost` the dispatcher pays; mana value 0 pays nothing (and a card with no mana cost is still castable, 118.6a); the
>   spell keeps its normal timing (the free-cast builder skips that check, so it's enforced at the offer); life is paid only if
>   the total covers it (119.4). The AI casts from the top for life behind the existing 10-life floor.
> · **SAC-N-CLASS:** "Sacrifice <two…ten> [other] <creatures | artifacts | enchantments | lands | permanents | nonland
>   permanents | artifacts and/or creatures>" activation costs parse now (abilities.js). The victims are frozen at the offer by
>   the spell-side count-sacrifice's least-valuable ranking (AC-1, Bankrupt in Blood — a precedent the activated side had
>   refused), a targeted permanent is never a victim, "other" keeps the source out, and the action names what it sacrifices.
> · **Re-pointed pins (the deferral graduated):** sacCountActivated.test.js (three parse pins and Mondrak / the synthetic
>   "Sacrifice two artifacts" permanent), abilities.test.js, coverage.test.js, doublePt.test.js (Zopandrel) — each asserts
>   the new behaviour, and a count of a non-fungible SUBTYPE ("two Goblins") holds the refusal that remains.
> · **Found on the way (2):** the AI's card lookup never searched the library, so it had never cast from the top via ANY
>   permission (Future Sight, Mystic Forge) — fixed. And a class sacrifice's action text read "Sacrifice 2 undefineds".
> · **Runtime:** `WITNESS bolasCitadel {"offered":[{"alt":{"kind":"payLife","payLife":2},"free":false,"mana":0}],"life":38,
>   "pool":2,"bears":1}` — Grizzly Bears cast off the top for 2 life with the mana pool untouched. Breya sacrificing herself still
>   deals her 3 (last-known information, probed). Witness `app/src/lib/learn/bolasCitadel.test.js` (12).
> · **Next:** #269 Hullbreaker Horror.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 16: Etali, Primal Storm (EDHREC #260) — cast any number of spells from among the exiled cards · **+1** · corpus 15,201
> Suite **17,559** green (1 skipped); lint 0; decks 2,734 → **2,735** / 2,998 (Jurassic Ramp 92). CI GREEN on P·15 (run 36903666148).
> Flip-diff **+1, zero LOST, zero RETIERED** (tier snapshots at cad5bc81 → the change: Etali, Primal Storm body-only →
> native-trigger). Top 1,000 **845** (needs +55); top 2,500 **1,666**. **Mutants 16/16** (restore byte-identical).
> · **A new decision, the free-cast windows' shape:** `effects/atoms/castFromAmong.js` exiles the top card of each player's
>   library and parks `pendingCastFromAmong` { controller, candidates: [{cardId, ownerId}] } (lands never become candidates).
>   legalChoices offers a free cast of each candidate still in its OWNER's exile (another player's card carries
>   `fromPlayerId`), plus "done", and short-circuits priority for everyone else; each cast takes its card off the list and
>   re-offers the rest ("any number"), the last cast or "done" closes it. A spell cast this way goes on the stack while the
>   ability finishes resolving (CR 608.2g); another player's card goes home (CR 400.3) — the permanent stays theirs to own,
>   the spell goes to their graveyard. The atom parks a decision, so programConfidence holds it to the program's last.
> · **The permission:** the dispatcher's cross-owner exile cast (Ragavan's impulse stamp) gains its second key — a
>   candidate of the caster's OWN open decision, the exact card and owner, nothing else; after "done" a leftover card
>   is refused. The AI casts what pickCastAction likes and takes "done"; its card lookup learned the same permission
>   (it could not see another player's candidate). The session's stuck-window fallback and the narrator know "done".
> · **Runtime:** `WITNESS etaliPrimalStorm {"exiled":{"user":["Llanowar Elves"],"ai1":["Divination"],"ai2":["Forest"],
>   "ai3":["Grizzly Bears"]},"offered":[["top-ai1","ai1",true],["top-ai3","ai3",true],["top-user",null,true]],"done":true}`
>   (a four-seat pod; the Forest is never offered). Witness `app/src/lib/learn/etaliPrimalStorm.test.js` (10).
> · **The family it opens:** Etali, Primal Conqueror #779, Villainous Wealth #2338, Kefka, Kotis, Fevered Suspicion share
>   the decision; each needs its own exile step.
> · **Next:** #263 Bolas's Citadel — its "pay life equal to its mana value rather than pay its mana cost" rider is dropped
>   by the static parser today, so a Citadel in play lets you cast from the top paying MANA (a runtime FP on a body-only
>   card); the slice models the alternative cost and the sacrifice-ten ability.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 15: Everflowing Chalice (EDHREC #251) — multikicker, offered for the first time · **+1** · corpus 15,200
> Suite **17,549** green (1 skipped); lint 0; decks 2,733 → **2,734** / 2,998 (Otharri 91). CI GREEN on P·14 (run 36899998342). Flip-diff
> **+1, zero LOST, zero RETIERED** (tier snapshots at e51dd016 → the change: Everflowing Chalice body-only → native-mana). Top 1,000
> **844** (needs +56); top 2,500 **1,665**. **Mutants 19/19** (restore byte-identical).
> · **The offer (CR 702.33c/d):** `parseMultikickerCost` (kicker.js) reads a clean "Multikicker {cost}" line; legalChoices offers one
>   cast per affordable kick count (0, 1, 2, … the pips folded in once per kick, capped at 20) for a NATIVE multikicker
>   permanent only — a kick is never paid for text the engine doesn't play (Marshal's Anthem, body-only, gets the plain cast).
>   A free cast is offered no kicks (single kicker's limitation). The AI pays for every kick it can.
> · **The count rides the object:** the cast's `kickCount` → PERMANENT_ETB `params.timesKicked` → `perm.timesKicked`; the
>   enters-with counters read the cast's own count, a multikicker permanent's ETB self context carries it (Wolfbriar's Wolves
>   even if it is destroyed, and a spell cast, in response — CR 608.2h). The state-wide `timesKickedForCast` stamp is GONE: a
>   spell cast in response overwrote it before the permanent resolved (latent while multikicker was never offered).
> · **Chalice's two lines:** `entersWithCountersPerKick` (staticAbilityParser) — "enters with a charge counter on it for each
>   time it was kicked", placed per kick, credited only for an honest counter kind; and the mana metric's charge-counter twin
>   ("{T}: Add {C} for each charge counter on this artifact" → selfCounters charge).
> · **Found on the way (3):** (1) multikicker was cited as CR 702.33h across eight files — that is Sticker kicker; it is 702.33c/d.
>   (2) The new reader first shared a name with kicker.js's single-kicker reader; resolvers imported both, which vitest's
>   transform tolerated and real ESM rejects — renamed before it shipped (module loads now run under Node ESM). (3) The
>   native-mana tier's residue gate never reads static or replacement sentences (a mana source with "…and you lose the game"
>   on its enters line still tiers native-mana) — a pre-existing over-claim, flagged as its own task.
> · **Re-pointed pins:** kicker.test.js ("the offer side is untouched" → the single-kicker reader still refuses multikicker,
>   parseMultikickerCost owns it), multikickerCount.test.js (the count now read off the permanent), entersWithMetricCounters,
>   manaReachability.test.js (Chalice was its unreadable dynamic amount — graduated; Astral Cornucopia's chosen-color charge
>   line holds the refusal). Shrine of Boundless Growth's sacrifice line now parses too (still body-only); the planner drops
>   zero-amount sources, so it is only ever sacrificed for real mana.
> · **Runtime:** `WITNESS everflowingChalice {"counters":{"charge":2},"timesKicked":2,"taps":1,"pool":2}`; Gnarlid Pack kicked
>   twice is a 4/4 with a spell cast in response; Wolfbriar kicked twice makes two Wolves after being destroyed in response;
>   Lightkeeper kicked three times gains 6. Witness `app/src/lib/learn/everflowingChalice.test.js` (12).
> · **Next:** #260 Etali, Primal Storm — "cast any number of spells from among those cards" from every player's exile: a new
>   decision (the cascade/discover/free-cast shape, any number, the owner's exile).

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 14: Malakir Rebirth (EDHREC #246) — choose a creature, lose 2 life, it comes back when it dies · **+1** · corpus 15,199
> Suite **17,537** green (1 skipped); lint 0; decks unchanged (2,733 / 2,998). CI GREEN on P·13 (run 36898554551). Flip-diff **+1, zero
> LOST, zero RETIERED** (tier snapshots at 4e13568b → the change: Malakir Rebirth // Malakir Mire land-partial → native-spell).
> Top 1,000 **843** (needs +57); top 2,500 **1,664**. **Mutants 6/6** (restore byte-identical).
> · **The frame:** "Choose target creature. You lose 2 life. Until end of turn, that creature gains '<body>'." — the splitter
>   cut it into three sentences and left "that creature" two atoms from its antecedent with an untargeted life loss between (the
>   referent walk binds only to the atom just before it). `matchChooseLoseLifeGrant` (effects/atoms/grantUntilEot.js) reads it
>   whole, in printed order: the controller's life loss, then the Feign Death family's until-EOT grant ON the chosen target,
>   its body passing the same validator as every grant. The only card printing the frame.
> · **Runtime:** `WITNESS malakirRebirth {"life":38,"bears":[{"id":"perm-4","tapped":true}],"yard":["Malakir Rebirth // Malakir
>   Mire"]}` — cast as the MDFC's instant face; the creature dies and returns tapped as a new object. An opponent's creature
>   returns under ITS OWNER's control; the target gone before resolution fizzles the spell whole (CR 608.2b — no life lost); the
>   grant ends at cleanup. Witness `app/src/lib/learn/malakirRebirth.test.js` (6).
> · **Next:** #251 Everflowing Chalice — needs multikicker offered (CR 702.33c/d), which the engine has never done.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 13: Gray Merchant of Asphodel (EDHREC #242) — the drain family past the X spell · **+9** · corpus 15,198
> Suite **17,531** green (1 skipped); lint 0; decks unchanged (2,733 / 2,998). CI GREEN on P·12 (run 36896398394). Flip-diff **+9, zero
> LOST, zero RETIERED** (tier snapshots at 607f4275 → the change: Gray Merchant, Kokusho, Malakir Bloodwitch, Agent of Masks,
> Subversion, Tormented Hero body-only → native-trigger; Scholar of Athreos → native-activated; Servant of Tymaret → native-mixed;
> Blood Tithe arbiter-spell → native-spell — each full oracle audited). Top 1,000 **842** (needs +58); top 2,500 **1,663**.
> **Mutants 10/10** (restore byte-identical).
> · **One matcher, three amounts:** `matchDrainEachOpponent` (templateMatchers) collapses "Each opponent loses … life. You gain
>   life equal to the life lost this way." into the one drain-each-opponent atom Exsanguinate already used — a printed N, "X,
>   where X is your devotion to <color>" (CR 700.5) or "life equal to the number of <count>" (parseCountSource; an unmodeled
>   source leaves the whole compound low). Not X-gated, never an X spell: the devotion X is defined by its own clause.
> · **The resolver:** the amount is read ONCE before any life moves (CR 608.2h — Gray Merchant gone by resolution counts
>   nothing), every opponent loses it, and the gain is the life each opponent ACTUALLY lost, off their total (CR 119.3 — past 0
>   still counts).
> · **Fixed on the way:** the drain gained the full amount for an opponent whose life total can't change (Teferi's
>   Protection's lock) — Exsanguinate included. It now gains only what was lost.
> · **Known, not changed:** subtype counts (Malakir Bloodwitch's Vampires, and every "for each <type>" count) ignore
>   changelings (CR 702.73a) — systemic in countMatches, flagged as its own task.
> · **Runtime:** `WITNESS grayMerchant {"lives":{"user":58,"ai1":34,"ai2":34,"ai3":34},"merchant":true}` (devotion 6: its
>   own two pips, Phyrexian Arena's two, Vault Skirge's Phyrexian pip, Deathrite Shaman's hybrid pip; a four-seat pod). Kokusho
>   dies: 5 each, +15; Malakir Bloodwitch with a Nighthawk: 2 each; Scholar's activation and Blood Tithe (one cast, no X).
>   Witness `app/src/lib/learn/grayMerchant.test.js` (11).
> · **Next:** #246 Malakir Rebirth (the worklist head at 842).

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 12: Animate Dead (EDHREC #224) — an Aura that enchants a creature card in a graveyard · **+1** · corpus 15,189
> Suite **17,520** green (1 skipped); lint 0; decks 2,732 → **2,733** / 2,998 (Teval 91). CI GREEN on P·11 (run 36894263773). Flip-diff
> **+1, zero LOST, zero RETIERED** (tier snapshots at ea6f411c → the change: Animate Dead body-only → native-aura). Top 1,000
> **841** (needs +59). **Mutants 12/12** (restore byte-identical).
> · **One gate:** `animateDeadGate.js` (a zero-import leaf) matches the EXACT printed text (Dance of the Dead shares the frame but
>   enters tapped and adds a doesn't-untap static and an upkeep payment — out). The cast offer, the dispatcher payload, the
>   AURA_ETB branch, both synthesized triggers and the coverage tier all read it, so the metric and the runtime can't drift.
> · **The lane:** the Aura spell TARGETS a creature card in ANY graveyard (CR 303.4a — the reanimate enumerator's anyGraveyard
>   pool, each target carrying its owner); resolving, a card still there (CR 608.2b — else the spell fizzles) lets the Aura
>   enter attached to no permanent, stamped `enchantedGraveyardCard`. Its ETB (effects/atoms/animateDead.js) checks the Aura is
>   still on the battlefield (CR 603.4), returns the card under the Aura's controller and attaches, stamping the creature
>   `animatedBy`; a card gone by then leaves the Aura attached to nothing → its owner's graveyard (CR 704.5m — the SBA sweep
>   reads only attached Auras, so the resolver does it). Its leave trigger finds the creature it animated — that creature's
>   controller sacrifices it; a creature already gone is a clean no-op.
> · **Found on the way (2):** the ETB sentinel first carried " and " — the clause splitter cut it, it parsed low and the trigger
>   routed to the Arbiter (Hideaway's comma lesson, one word over: sentinels stay free of commas AND conjunctions). And the
>   attached-bonus parse is all-or-nothing over the whole oracle, so the trigger sentences hid the -1/-0: the layer engine
>   reads this card through its attached view ("Enchant creature" + the bonus — what the card says it becomes).
> · **Runtime:** `WITNESS animateDead {"wurm":true,"attached":true,"linked":true,"size":[5,4],"stamp":null}`; an opponent's
>   creature returns under your control; the card leaving first fizzles the spell (the Aura never enters); the Aura removed in
>   response to its trigger returns nothing; the Aura destroyed: the creature is sacrificed to its owner's graveyard; the
>   creature dying first: the Aura falls off, nothing more. Witness `app/src/lib/learn/animateDead.test.js` (9).
> · **Next:** #242 Gray Merchant of Asphodel (the worklist head at 841).

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 11: Idol of Oblivion (EDHREC #196) — "you created a token this turn" · **+2** (Bennie Bracks, Zoologist) · corpus 15,188
> Suite **17,511** green (1 skipped); lint 0; decks unchanged (2,732 / 2,998). CI GREEN on P·10 (run 36892670498). Flip-diff **+2, zero
> LOST, zero RETIERED** (tier snapshots at 42b12981 → the change: Idol of Oblivion body-only → native-activated, Bennie Bracks
> body-only → native-trigger). Top 1,000 **840** — 84% (needs +60). **Mutants 5/5** (restore byte-identical).
> · **The flag:** the mint chokepoint every token source funnels through (`tokens.fireTokenEnterTriggers`) stamps the creator's
>   per-turn `createdTokenThisTurn` for a REAL token only — a manifested card rides the same chokepoint and is not one
>   (CR 701.34); the untap reset (`resetSpellsCastAllPlayers`) clears it with the other per-turn counters; the shared condition
>   reader answers "you created a token this turn", so Idol's activation gate and Bennie's end-step intervening-if read the
>   same flag (the parseable checks pick the reader up by probing it).
> · **Two pins graduated:** the first suite run went red on two BOUNDARY-MARKER pins that used "you created a token this
>   turn" as their stand-in for an untracked condition (conditionTurnEventReaders' still-parks list, conditionDisjunction's
>   unreadable half). Re-pointed per their own discipline, not deleted: the still-parks pin now asserts the condition reads;
>   the disjunction's stand-in moved to "you put a counter on a creature this turn", still on the still-parks list.
> · **Runtime:** `WITNESS idolOfOblivion {"before":false,"flag":true,"offered":true,"drew":1}` — no token: no draw; a Treasure
>   made: the draw is offered and draws; manifest dread: flag unset; the turn's reset: cleared. Witness
>   `app/src/lib/learn/idolOfOblivion.test.js` (5).
> · **Next:** #224 Animate Dead (the worklist head at 840).

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 10: HIDEAWAY (CR 702.75) — Mosswort Bridge (EDHREC #194) · **+3** (Windbrisk Heights #656, Clive's Hideaway) · corpus 15,186
> Suite **17,506** green (1 skipped); lint 0; decks 2,730 → **2,732** / 2,998 (Shorikai Vehicles 91, Jurassic Ramp 91). CI GREEN on
> P·9 (run 36891093953). Flip-diff **+3, zero LOST, zero RETIERED** (tier snapshots at 543269ed → the change: Mosswort Bridge,
> Windbrisk Heights, Clive's Hideaway land-partial → land). Top 1,000 **839** (needs +61). **Mutants 15/15** (restore
> byte-identical).
> · **The keyword:** "Hideaway N" is all reminder text, so detectTriggers synthesizes its ETB from the keyword line (the
>   renown / mobilize idiom) for EXACTLY ONE printed instance (Evercoat Ursine's two would need two links); coverage bumps
>   the shaped count to match and the land gate admits the bare keyword line. The sentinel is comma-free — a first draft
>   carried the reminder wording and the clause splitter cut it at ", then".
> · **The hide:** `effects/atoms/hideaway.js` opens the impulse-dig pause with a new HIDEAWAY destination: the pick is exiled
>   stamped `_hideawayOf` and the land is stamped `hideawayCardId` (the CR 607.2a link — a land that changed zones is a new
>   object, unlinked); the rest go to the bottom at random; exiling one is mandatory, so a pick naming no candidate hides
>   the first. Not named `faceDown`: that field means a morph / manifest body to the engine.
> · **The linked play:** "you may play the exiled card without paying its mana cost if <condition>" — the parser's
>   conditional rider takes the trailing "if" (runEffectProgram checks it as the ability resolves, CR 608.2c), and the atom
>   parks a hidden NONLAND card behind the discover decision with a leave-exiled decline (The Key to the Vault's lane). A
>   hidden LAND is not offered — playing it would be a land play no lane grants yet (a safe under-offer). The ability is
>   offered only while a hidden nonland card waits and the condition holds, so the autopilot never pays to resolve nothing.
> · **Why +3:** Windbrisk Heights' "you attacked with three or more creatures this turn" and Clive's Hideaway's "you control
>   four or more legendary creatures" ride the same rider onto readers that already exist (Minas Tirith's attacked count, a
>   legendary-creature count) — checked live: true at three attackers / four legends, false at two / three. Spinerock Knoll
>   (#755) stays partial: "an opponent was dealt 7 or more damage this turn" has no reader.
> · **Runtime:** `WITNESS hideawayLook {"looked":["l-wurm","l-bears","l-forest","l-giant"],"exiled":[["l-wurm",true]],"linked":"l-wurm","top":["l-f2","l-f3"],"bottom":["l-bears","l-forest","l-giant"]}`
>   and `WITNESS hideawayPlay {"parked":{"controller":"user","cardId":"x-hidden","mv":null,"declineTo":"exile"},"fromExile":"exile","wurmsOnBattlefield":3,"exile":0}`;
>   nine power: not offered; a Wurm leaving in response: nothing parked; a hidden land: refused at the offer and at the
>   resolver. Witness `app/src/lib/learn/mosswortBridge.test.js` (11).
> · **Next:** #196 Idol of Oblivion (the worklist head at 839).

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 9: Tireless Provisioner (EDHREC #182) — "create a Food token or a Treasure token" · **+2** (Ant-Man's Army) · corpus 15,183
> Suite **17,495** green (1 skipped); lint 0; decks unchanged (2,730 / 2,998). CI GREEN on P·8 (run 36889592660). Flip-diff **+2, zero
> LOST, zero RETIERED** (tier snapshots at ec9e0ec7 → the change: Tireless Provisioner and Ant-Man's Army body-only →
> native-trigger). Top 1,000 **837** (needs +63). **Mutants 3/4** (restore byte-identical; the survivor is equivalent, below).
> · **The clause:** the controller makes one of the two (CR 608.2d). `matchNamedTokenChoice` reads exactly "create a/an
>   <Word> token or a/an <Word> token" (two different words); the parser builds each half with itself and requires HIGH, and
>   wraps them as a choose-one of the two single-token modes, so the existing mode machinery offers and resolves it. On a
>   trigger the mode is picked as it goes on the stack — earlier than the printed choice, so never an advantage. Mode order
>   is the house pick for the auto-chooser: Treasure leads when it is one of the two, otherwise the printed order.
> · **Guards measured, not assumed:** the first draft also required each half to be exactly one named-token atom. Probed over
>   43 token words, every HIGH "Create a <Word> token" is exactly that, so the restriction could never fail a test and
>   guarded nothing (a HIGH half of any other token would be modeled just as honestly) — removed. The HIGH gate stays: it
>   is the engine's low-runs-nothing contract. Its mutant survives as EQUIVALENT — no single-word token clause parses low
>   with atoms today.
> · **Noticed, not changed:** trigger modes are auto-picked for every seat, the human's included (the flush chooser); a
>   human never chooses Provisioner's token. Pre-existing — the modal-trigger UI is its own piece of work.
> · **Runtime:** `WITNESS tirelessProvisioner ["Treasure"]` — a Forest played with Provisioner out. Witness
>   `app/src/lib/learn/tirelessProvisioner.test.js` (3).
> · **Next:** #194 Mosswort Bridge (the worklist head at 837).

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 8: Gemstone Caverns (EDHREC #179) — its any-colour tap was a phantom; the pre-game line under CR 103.6 · **+1** · corpus 15,181
> Suite **17,492** green (1 skipped); lint 0; decks 2,725 → **2,730** / 2,998 (cdh 94, Squirrel Girl 93, Believe it! 91, Kinnan
> 91, Killer Turts 91). CI GREEN on P·7 (run 36888032921). Flip-diff **+1, zero LOST, zero RETIERED** (tier snapshots at e2b4319e → the
> change: Gemstone Caverns land-partial → land). Top 1,000 **836** (needs +64). **Mutants 4/4** on the final code (restore
> byte-identical).
> · **The phantom (probed live):** "{T}: Add {C}. If Gemstone Caverns has a luck counter on it, instead add one mana of any
>   color." — the any-colour arm read "add one mana of any color" off the rider, so every Caverns tapped for any colour with
>   no luck counter anywhere. The counter-gated "instead" sentence is now dropped before the parse (read as its base, the
>   documented under-read of the other "instead" forms): the land makes {C}. The corpus prints this rider once.
> · **The pre-game line:** "If this card is in your opening hand and you're not the starting player, you may begin the game
>   with Gemstone Caverns on the battlefield with a luck counter on it. If you do, exile a card from your hand." is the
>   CR 103.6 pre-game action the Leylines carry — never offered, pre-stripped by coverage under the same policy (the land is
>   played from hand as printed). So no luck counter is ever placed and the upgrade is unreachable, not merely unmodeled;
>   nothing it would unlock is credited. Whole-sentence anchored — another rider after "If you do," keeps the card partial.
> · **Runtime:** `WITNESS gemstoneCaverns {"tier":"land","product":{"colors":["C"],"amount":1,"requiresTap":true},"green":false,"generic":true,"colorless":true}`.
>   Witness `app/src/lib/learn/gemstoneCaverns.test.js` (2).
> · **Lint caught one on the way:** a useless `\/` escape in the rider regex (fixed; the harness re-ran on the final code).
> · **Next:** #182 Tireless Provisioner (the worklist head at 836).

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 7: Three Tree City (EDHREC #178) — the costed chosen-type mana line, funded by the free-activation fix · **+1** · corpus 15,180
> Suite **17,490** green (1 skipped); lint 0; decks unchanged (2,725 / 2,998). CI GREEN on the fix (run 36886525213). Flip-diff **+1,
> zero LOST, zero RETIERED** (tier snapshots at 9c6659ed → the change: Three Tree City land-partial → land). Top 1,000
> **835** (needs +65). **Mutants 9/9** (restore byte-identical).
> · **The line:** "{2}, {T}: Choose a color. Add an amount of mana of that color equal to the number of creatures you control of
>   the chosen type." rides as an extra mana record — any one colour, sized live by a new countForSpec kind
>   (`creaturesOfSourceChosenType`: the creatures of the type THIS land chose as it entered, CR 614.12; a changeling creature
>   counts for every type, CR 702.73a; no stamp → 0, never a guessed type), behind its {2}, which the planner funds from
>   other mana first (the free-activation fix — it never pays its own {2}). manaSources' extra records now resolve a count
>   and carry an activation cost. The cost prefix admits mana pips only, so a non-mana cost item is never dropped.
> · **The chooser:** the land gate reads the card's own name in "As Three Tree City enters, choose a creature type." (CR
>   201.5); the runtime chooser regex already accepted it and stamps chosenType on the land drop.
> · **Honest now:** before this slice the costed line was credited off a land-fallback {C} (`isManaLine` admits any land
>   line with "add") and never offered — the land-tier gap. Nykthos is the same case, still open (credited, never offered).
> · **Runtime:** `WITNESS threeTreeCity {"castable":true,"tapped":["f1","f2","ttc"],"pool":{}}` — Elf chosen, five Elves:
>   two Forests pay the {2}, it makes five blue, Tidings ({3}{U}{U}) resolves off a green board; five Goblins: nothing; no
>   other mana: nothing; four Elves and a Changeling Outcast: five. Witness `app/src/lib/learn/threeTreeCity.test.js` (8).
> · **Next:** #179 Gemstone Caverns (the worklist head at 835).

> ## 🛠️ 2026-10-01 — FIX: mana abilities with a mana cost pay it (Signets, the {1} filter lands, Cabal Coffers, Chromatic Star) — found scoping #178 · corpus unchanged 15,179
> Suite **17,482** green (1 skipped); lint 0; decks unchanged. CI GREEN on P·6 (run 36883521016). Flip-diff **0 / 0 / 0** (a runtime
> fix — no tier moves). **Mutants 15/15** (restore byte-identical).
> · **The bug (probed live):** the mana parse reads the "Add" clause and nothing read the "{1}," in front of it, so every mana
>   ability with a mana cost tapped for FREE. A lone Dimir Signet paid {U}{B} with no other mana on the board; a Signet and an
>   Island cast Divination ({2}{U}) — and the commit tapped both and charged nothing. A corpus census found ~100 cards whose
>   runtime product comes from a costed line: all ten Signets, the {1} filter lands, Cabal Coffers, Selvala, Chromatic Star,
>   the Eggs and the Devotees among them. Every sim with one of them ran on phantom mana (CREED: the forbidden direction).
> · **The fix:** `manaActivationCost` reads the mana part of the cost on the line the main product comes from (a product a
>   plain line makes is free; an unpriceable pip drops the record). manaSources carries it; the planner first pays WITHOUT any
>   costed source (the old plan, byte-identical), then activates them one at a time, each funded from the pool, the uncosted
>   sources and earlier activations' mana — never from itself, never by its own permanent's other record — before its output
>   joins the pool (CR 602.2b, 605.3b; two Signets chain off one Island into exactly three mana). The funding rides the plan
>   as `activationSpend`, charged by the commit and kept out of `spend` (converge, sunburst and the mana-spent riders read
>   `spend` as mana spent on the spell). The activated tap record is built by the core itself, so a spend-restricted costed
>   source is refused (Cormela's instant-and-sorcery mana never funds a creature — no laundering).
> · **The explicit tap:** a costed source is offered only when the floating pool can pay it, and the dispatcher charges the
>   pool (a forged tap throws). Found on the way: a fixed bundle was offered per colour — a karoo or a Signet tapped by hand
>   made {U}{U} or {B}{B}; it is one action carrying {U}{B} now.
> · **Runtime:** `WITNESS loneSignet []` and `WITNESS karooTap [{"color":"U","amount":2,"fixed":{"U":1,"B":1}}]`; Signet +
>   Island pays {U}{B} and leaves the pool empty; Coffers with three Swamps makes four black, not six; Chromatic Star needs an
>   Island to crack. Witness `app/src/lib/learn/manaCostedSources.test.js` (14).
> · **Noticed, not changed:** Evendo / Uthros read their station-gated "12+" line as the main product (the gate is ignored);
>   it now costs its {G}/{U} instead of being free — still not the printed plain tap. Crypt of Agadeem's main record is a
>   land-fallback {C}. Both recorded for the land-tier honesty work.
> · **Next:** #178 Three Tree City — its {2},{T} chosen-type line is exactly the costed mana ability this fix can now fund.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 6: War Room (EDHREC #140) — a life cost sized by your commanders' color identity; the identity read fixed (Commander's Plate) · **+1** · corpus 15,179
> Suite **17,468** green (1 skipped); lint 0; decks unchanged (2,725 / 2,998). CI GREEN on P·5 (run 36881715229). Flip-diff **+1,
> zero LOST, zero RETIERED** (tier snapshots at c2b5fa10 → the change: War Room land-partial → land). Top 1,000 **834**
> (needs +66). **Mutants 12/12** on the final code (restore byte-identical; the first run's survivor was a fixture mask,
> below).
> · **The read:** `commanderIdentity.js` (a zero-import leaf) answers "your commander's color identity" one way: the
>   identity stamped on the seat at game start (`createPlayerState → commanderIdentity`, the union over its commanders —
>   CR 903.4a, it never changes) plus the command zone (hand-built states, older saves). `null` = no commander (CR 903.4f).
> · **The bug it fixed:** layers read the command zone ALONE, so once the commander was cast the identity read empty —
>   Commander's Plate on a cast mono-green commander gave protection from all five colors, green included (probed through a
>   real cast: `BGRUW`; now `BRUW`). And with no commander at all the Plate gave all five; CR 903.4f says that part does
>   nothing — now it does nothing.
> · **The cost:** "Pay life equal to the number of colors in your commanders' color identity" parses as a flagged life
>   cost; legalChoices sizes it once per ability, before the CR 119.4 gate and every action built from it, and refuses it
>   with no commander (CR 903.4f — a cost referring to the quality is unpayable). The flag rides only when present, so every
>   other ability object is byte-identical.
> · **The fixture mask:** the partners case first read a fresh game, both partners still in the command zone — the zone read
>   covered for a stamp that kept only the first commander (W2 survived). The test now casts both partners, so the stamp
>   alone answers.
> · **Runtime:** `WITNESS warRoom {"payLife":2,"lifePaid":2,"drew":1,"warRoomTapped":true}` (an Azorius commander already
>   cast) and `WITNESS platedCommander ["B","R","U","W"]`; no commander: not offered; 1 life vs a two-color identity: not
>   offered, exactly 2: offered; a colorless commander: zero life. Witness `app/src/lib/learn/warRoom.test.js` (9).
> · **Noticed, not changed:** Command Tower and Arcane Signet are modeled as any color, not limited to the identity — equal
>   for a deck's own costs, wrong for an off-identity spell and for a game without a commander (CR 903.4f). A follow-up.
> · **Next:** #178 Three Tree City (the worklist head at 834).

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 5: Victimize (EDHREC #128) — sacrifice, then return the chosen; the "if you do" gate on a sacrifice · **+1** · corpus 15,178
> Suite **17,459** green (1 skipped); lint 0; decks unchanged (2,725 / 2,998). CI GREEN on P·4 (run 36879475841). Flip-diff **+1,
> zero LOST, zero RETIERED** (tier snapshots at 5c241e61 → the change: Victimize arbiter-spell → native-spell). Top 1,000
> **833** (needs +67). **Mutants 12/13** (restore byte-identical; the survivor is equivalent, below).
> · **The template:** the three sentences are one instruction — the targets are a mandatory pair chosen at cast (CR 601.2c,
>   115.3), the sacrifice and the return follow in written order (CR 608.2c); split, "the chosen cards" has no referent.
>   `matchSacThenReturnChosen` collapses the card to the controller's sacrifice (the existing edict chain: forced with one
>   creature, the sacrifice choice with two or more, nothing with none) and the paired reanimate, tapped. The corpus prints
>   the shape once.
> · **The gate:** the reanimate carries `ifSacrificed`; runEffectProgram runs it only when the atom before it logged a
>   sacrifice with a real victim during its own resolution — read off what happened, never predicted. When the sacrifice
>   paused for a choice, resolveSacrificeChoice hands its answer (did the pick really go) to the resume; any other settler's
>   resume skips the gated atom (a dropped payoff, never a fabricated one). Three conditions the first draft carried (the
>   previous atom's op and subject, the caster check) were implied by the one producer and no test could see them fail —
>   removed under the hollow-gate law; the producer's shape is documented at the gate instead.
> · **Equivalent mutant:** "the inline read counts any log line" survives — an empty sacrifice pool logs nothing today. The
>   predicate names the sacrifice event rather than counting lines, so a future no-op log cannot flip the gate.
> · **Runtime:** `WITNESS victimize {"pending":null,"battlefield":["Craw Wurm (tapped)","Hill Giant (tapped)"],"graveyard":["Grizzly Bears","Victimize"]}`
>   and `WITNESS victimizeNoSac {"battlefield":[],"graveyard":["Craw Wurm","Hill Giant","Victimize"]}` — one creature: it is
>   sacrificed and both chosen cards return tapped; none: nothing returns; two: the choice, and the picked one goes; a pick that
>   sacrifices nothing returns nothing; one chosen card gone: the other still returns (CR 608.2b); both gone: the spell does
>   not resolve and nothing is sacrificed. Witness `app/src/lib/learn/victimize.test.js` (9).
> · **Next:** #140 War Room (the worklist head at 833).

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 4: Urza's Saga (EDHREC #120) — the Saga self-grant, the printed-mana-cost tutor, Saga lands on the land drop · **+1** · corpus 15,177
> Suite **17,450** green (1 skipped); lint 0; decks 2,720 → **2,725** / 2,998 (cdh 93, Earth Bent 92, Squirrel Girl 92, Captain
> America 91, Wolverine 91). CI GREEN on P·3 (run 36876128527). Flip-diff **+1, zero LOST, zero RETIERED** (tier snapshots at
> 9b9df1b9 → the change: Urza's Saga land-partial → land). Top 1,000 **832** (needs +68). **Mutants 14/14** (restore
> byte-identical).
> · **The self-grant:** chapter I (the Saga gains "{T}: Add {C}.") and chapter II (the Construct ability) parse as one
>   `self-grant` atom — a mana spec (parseGrantedManaSpec, now exported) or an activated body the grant validator vouches —
>   resolved through the layer-6 addAbility vehicle with a fixed id and NO duration: it lasts as long as the object does
>   (CR 611.2a, 400.7). Only "this Saga" — any other subject parks.
> · **The tutor:** chapter III's "artifact card with mana cost {0} or {1}" is a `manaCostIn` filter on the PRINTED cost
>   (CR 202.1): an artifact land (no mana cost) and Chalice of the Void ({X}{X}) have mana value 0 and are not offered.
> · **The land:** a Saga land's whole text is its chapter list, so the land gate asks the Saga gate
>   (`sagaChaptersRouteNatively`: every trigger a chapter, one per chapter, each routing natively). The land drop now runs
>   Saga entry — the sagaFinal stamp, the lore counter through addCounter (CR 714.3a), the crossed chapter on the stack.
> · **Fixed on the way (2):** ① the land drop pre-doubled a land's named entry counters and then handed them to addCounter,
>   which doubles again — Vivid Marsh entered with 8 charge counters under Doubling Season, now 4 (CR 122.6). ② manaProduction
>   read a Saga's chapter text as its own mana (CR 714.2b — a chapter is a triggered ability), so Urza's Saga tapped for {C}
>   the turn it landed; that leak hid mutant U6 until a runtime test caught it. Chapter lines are dropped and the re-parse
>   blanks the type line — load-bearing: kept, the land fallback reads the lore reminder's "add". Over every Saga in the
>   bundled oracle four reads change, all phantoms removed (Urza's Saga, Song of Freyalise, Huatli, Poet of Unity,
>   Welcome to . . .), none gained; tiers unchanged.
> · **Runtime:** `WITNESS urzasSaga {"offered":["sol","thopter"],"solOnBattlefield":true,"sagaGone":true,"sagaInGraveyard":true}`
>   — played as the land drop, chapter I pays for Sol Ring, chapter II makes a Construct ({2}, {T}), chapter III offers only
>   the printed {0}/{1} artifacts and the Saga is sacrificed; under Doubling Season it lands with two lore and fires I and II
>   at once; a countered chapter I leaves it no mana. Witness `app/src/lib/learn/urzasSaga.test.js` (8) +
>   `landEntersWithCounters.test.js` (+1).
> · **Next:** #128 Victimize (the worklist head at 832).

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 3: the Construct token ("This token gets +1/+1 for each artifact you control") — the prerequisite for #120 Urza's Saga and #802 Urza, Lord High Artificer · **+1** (Digsite Engineer) · corpus 15,176
> Suite **1,698 files / 17,441 tests** green (1 skipped); lint 0; decks unchanged (2,720 / 2,998). CI GREEN on P·2 (run 36874266190). Flip-diff **+1,
> zero LOST, zero RETIERED** (tier snapshots at a28a1733 → the change: Digsite Engineer body-only → native-trigger). Top 1,000
> unchanged (831) — this slice exists for Urza's Saga. **Mutants 5/6** on the final code (restore byte-identical; the
> survivor is equivalent, below).
> · **The token:** parseTokenStaticAbility reads "This token gets +1/+1 for each artifact you control" (every gaining
>   printing says "token") and mints it as the creature form the static parser already reads — a layer 7c self bonus
>   counting its controller's artifacts (CR 613.4c). The zero-toughness token refusal gains its one exception: a 0/0 whose
>   static is exactly this one AND whose description is an artifact (it counts itself, so it is never below 1/1). A 0/0
>   Plant with the same static still parks.
> · **The residue strip:** coverage's "If you do, …" tail strip stopped at the first period — including the one INSIDE a
>   token's quoted ability — and left the closing quote as residue, parking every card whose "If you do" tail creates a
>   token with a quoted ability. It now consumes a quoted span whole and still ends at the first period outside quotes.
> · **The equivalent mutant:** letting that strip run to the end of the line SURVIVED — because detectTriggers folds the rest
>   of a trigger's line into its effect clause, which the HIGH gate vouches (or refuses) before the strip ever runs. The
>   fence (a real unmodeled sentence after the tail) parks the card on that gate.
> · **Runtime:** `WITNESS constructToken {"constructs":1,"types":["Artifact","Creature","Token"],"size":[2,2]}` — cast
>   Ornithopter with Digsite Engineer out, pay {2}: the Construct enters, and once Ornithopter lands it counts both
>   artifacts; declining makes none. Witness `app/src/lib/learn/constructToken.test.js` (4).
> · **Next:** #120 Urza's Saga — its chapters' "This Saga gains …" (a self-grant through the existing layer-6 addAbility
>   vehicle, no duration) and the "artifact card with mana cost {0} or {1}" tutor.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 2: Feed the Swarm (EDHREC #89) — "You lose life equal to that permanent's mana value." · top 1,000 **830 → 831** · **+1** · corpus 15,175
> Suite **1,697 files / 17,437 tests** green (1 skipped); lint 0; decks unchanged (2,720 / 2,998). CI GREEN on P·1 (run 36872725502).
> Flip-diff **+1, zero LOST, zero RETIERED** (tier snapshots at 6a9623f9 → the change: Feed the Swarm arbiter-spell →
> native-spell). **Mutants 4/4** on the final code (restore byte-identical).
> · **The build:** the losing twin of "You gain life equal to its mana value" (Divine Offering) — the removal+caster-rider
>   matcher reads Feed the Swarm's exact sentence (its only printing) as `controllerRider: { kind: "casterLoseLife", metric:
>   "mv" }`, and applyControllerRider makes the caster lose that much (life loss, CR 119.3 — not damage), from the mana value
>   captured before the permanent left. Like its family it resolves when the destroy fails (an indestructible target).
> · **Runtime:** `WITNESS feedTheSwarm {"bearAlive":false,"aiGraveyard":["Grizzly Bears"],"userLife":38}` · the AI's Pacifism
>   goes and you lose 2 · Darksteel Myr (power 0, mana value 3) survives and you still lose 3. Witness
>   `app/src/lib/learn/feedTheSwarm.test.js` (5).
> · **Fixture note:** the capture reads the printed mana value off the card's `cmc`, which the card index carries; the first
>   run's hand-built cards had none and lost 0. Fixtures carry `cmc` and `colors` like the index does.
> · **Next:** #120 Urza's Saga — three pieces: a permanent self-grant of a quoted ability ("This Saga gains …"), the
>   Construct token with "This token gets +1/+1 for each artifact you control", and the "mana cost {0} or {1}" tutor.

> ## 🎯 2026-10-01 — PLAY-WEIGHTED · 1: Myriad Landscape (EDHREC #28) — "up to two basic land cards that share a land type" · top 1,000 **829 → 830** · **+1** · corpus 15,174
> Suite **1,696 files / 17,432 tests** green (1 skipped); lint 0; decks unchanged (2,720 / 2,998). CI GREEN on the worklist commit (run 36870986732).
> Flip-diff **+1, zero LOST, zero RETIERED** (tier snapshots at 6820140a → the change: Myriad Landscape land-partial → land).
> **Mutants 6/6** on the final code (restore byte-identical).
> · **The build:** the up-to-N land fetch (`mf`) reads the rider "that share a land type" on its LAND arm only, stamped as
>   `filter.shareLandType` (the creature arm refuses it); resolveTutorChoice's chained pick keeps only the candidates sharing
>   a land type with the card just fetched, read off the cards themselves (candidates carry only id/name; CR 205.3i — a
>   land's subtypes are its land types). Myriad is the only card printing the rider, so the second pick is the whole rule.
> · **Runtime:** `WITNESS myriadLandscape {"offered":["f2","snow"],"fetched":[{"id":"f1","tapped":true},{"id":"snow","tapped":true}],…}`
>   — Forest first offers only Forest and Snow-Covered Forest; an Island with no partner, or Wastes (no land type), ends the
>   search at one land. Witness `app/src/lib/learn/myriadLandscape.test.js` (4).
> · **The survivor that wasn't:** shifting the regex's tapped capture first SURVIVED — my run lacked a rider-less tapped
>   fetch. parser.test.js already pins Nissa's Renewal entering tapped through this arm; with it in the run, killed.
> · **Next:** the worklist's top line — #89 Feed the Swarm (destroy, then lose life equal to that permanent's mana value).

> ## 🎯 2026-10-01 — THE PLAY-WEIGHTED PROGRAM (Colton: "So 1k then 2.5k then we re assess from there") — the worklist tool
> The steering metric moves from the corpus total to PLAY-WEIGHTED coverage (the most-played cards by edhrec_rank; covered =
> a native tier or a plain land — measure-coverage's existing play-weighted block). Phase 1: the top 1,000 to 90% (829 →
> 900, +71). Phase 2: the top 2,500 to 90% (1,648 → 2,250, +602). Then reassess with Colton. Stage ④ waits behind it.
> · **The tool:** `node scripts/measure-coverage.mjs --played=N` prints the top-N's uncovered cards in rank order with each
>   one's sole-blocker lines (re-classified with each line removed), from the SAME card set and covered test as the
>   play-weighted block (one `playCovered` definition in the file), so its header equals that block's line for N.
> · **The shape (measured):** of the 852 top-2,500 misses — 559 body-only, 193 arbiter-spell, 72 land-partial, 28 walkers —
>   430 are one line away, and those lines are 429 distinct shapes (only "station" repeats). By rank: #1–500 92.6% covered,
>   #501–1,000 73.2%, #1,001–1,500 62.2%, #1,501–2,000 53.4%, #2,001–2,500 48.2%. No veins: the program is mostly one
>   card per slice.
> · **Selection rule:** the highest-ranked uncovered card the CREED can build; walkers stay their own program (Colton
>   09-30), skipped with the reason recorded.

> ## 🎯 2026-10-01 — 09-06 PLAN STAGE ③ · 54: "Bloodrush — {cost}, Discard this card: …" — the from-hand combat window — Rubblebelt Maaka and ten more · **+11** · corpus 15,173 (44.3%) / 34,245 · **STAGE ③ CLOSED**
> Suite **1,695 files / 17,428 tests** green (1 skipped); lint 0; decks unchanged (2,720 / 2,998 — a corpus slice; the shelf is done). CI GREEN on D44
> (run 36834537604). Flip-diff **+11, zero LOST, zero RETIERED** (tier snapshots at 304d705f → the change: Rubblebelt Maaka, Viashino Shanktail, Skinbrand Goblin, Scab-Clan Charger, Scorchwalker, Skarrg Goliath, Wrecking Ogre, Zhur-Taa Swine, Wasteland Viper, Ghor-Clan Rampager, Slaughterhorn body-only → native-body).
> **Mutants 8/8** on the final code (restore byte-identical).
> · **The row (fresh census, 10-01, 3 sole):** "bloodrush — {C}, discard this card: target attacking creature gets +N/+N until
>   end of turn". Bloodrush is an ability word (CR 207.2c), so the line is the ordinary from-hand discard ability; the parser
>   took only the Channel label. Its target exists only in combat, and the from-hand lane offered only in its controller's
>   main phase — crediting the label alone would have repeated ④-AE's hollow credit (a pool that can never be non-empty).
> · **Build:** parseDiscardCostAbility (and coverage's line strip) read the bloodrush label like Channel's;
>   actionsDiscardAbilityFromHand gets ④-AE's combat window — in a combat step, EITHER player holding priority may activate a
>   from-hand ability whose program targets a creature by combat role (CR 602.2); every other discard ability keeps the
>   own-main-phase window byte-for-byte. The rule-based AI never picks discard-ability actions, so its play is unchanged.
> · **Runtime:** `WITNESS bloodrush {"targets":["ATT"],"graveyard":["Rubblebelt Maaka"],"size":[5,5]}` · Ghor-Clan
>   Rampager adds +4/+4 and trample · the defender may bloodrush the AI's attacker · Trumpeting Carnosaur's non-combat-role
>   discard ability stays main-phase-only (yours) · Maaka ON the battlefield offers nothing (the line is not an ability of the
>   permanent) · no priority, no offer. Witness `app/src/lib/learn/bloodrush.test.js` (8). Parked on their own rows: Rubblehulk
>   (+X/+X), Pyrewild Shaman (a second line).
> · **A pin graduated:** crAbilityWords.test.js held Maaka at not-native as its proof that bloodrush is never a battlefield
>   activation. It now reads native-body through the from-hand lane, and the pin states the real point: the label stays on the
>   line, and the permanent's own ability parse never models it.
> · **🏁 STAGE ③ CLOSED:** the fresh census's ≥3-sole rows are all banked (§3's list) but two — this one, and SPLICE (3 sole:
>   "splice onto instant or sorcery {C}{C}" — a reveal-from-hand cost that adds the spliced text to the spell; no machinery →
>   banked). Every row below is 2-sole, under §3's line (the line the loop overran before 09-30). Next: §4, the Quartet.

> ## 🏁 2026-10-01 — SHELF DECKS · D44: PEARL-EAR — AFFINITY FOR AURAS + THE MODIFIED-TARGET DRAW — Light-Paws Voltron 89 → 90 · **+1** · corpus 15,162 / 34,245 (44.3%) · **THE SHELF IS DONE: 29 of 30 at ≥90**
> Suite **1,694 files / 17,420 tests** green (1 skipped); lint 0; decks 2,720 / 2,998. CI GREEN on D43 (run 36833275503). Flip-diff **+1, zero LOST,
> zero RETIERED** (tier snapshots at 3f6dbb15 → the change: Pearl-Ear, Imperial Advisor body-only → native-mixed). **Mutants 8/8** on the final code (restore byte-identical).
> · **Affinity for Auras, granted** (CR 702.41a): "Enchantment spells you cast have affinity for Auras." is an enchantment
>   reducer whose amount `collectCostReducers` stamps from the battlefield the cast lane hands it — the caster's own — so the
>   count is the caster's Auras at cost determination (CR 601.2f); an opponent's Aura on your creature doesn't count. Generic
>   only, like every reducer.
> · **The cast trigger** (CR 700.9): "Whenever you cast an Aura spell that targets a modified permanent you control" — a new
>   spell filter checkCastTriggers resolves beside the chosen-type one, reading the cast-time targets with the existing
>   isModifiedPermanent (a counter, an Equipment, or an Aura its controller controls). Anchored: another spell type or target
>   description stays unread.
> · **Runtime:** `WITNESS pearlEar {"withTwoW":true,"withOneW":false}` — With Great Power . . . costs {1}{W} under two Auras
>   · two AI-controlled Pacifisms on your creatures don't count · Glory Seeker isn't reduced · Rancor at a countered or an
>   equipped Bear draws; at an unmodified Bear, at the AI's countered Bear, or Giant Growth at yours, nothing. Witness
>   `app/src/lib/learn/pearlEar.test.js` (8).
> · **🏁 STAGE BOUNDARY — the shelf (Colton's "Do my decks", 09-30):** 29 of 30 decks read ≥90; Atraxa 74 is DEFERRED
>   (planeswalkers last, as their own program). Light-Paws went 83 → 90 across D39–D44 — through the very rows the 09-05
>   ceiling call sized L. Aggregate 2,720 / 2,998 (90.7%). Next: the 09-06 plan's stage ③ (the residue census), then ④.

> ## 🃏 2026-10-01 — SHELF DECKS · D43: UMBRA MYSTIC — UMBRA ARMOR FOR THE AURAS ON YOUR PERMANENTS — Light-Paws Voltron 88 → 89 · **+1** · corpus 15,161 / 34,245 (44.3%)
> Suite **1,693 files / 17,412 tests** green (1 skipped); lint 0; decks 2,719 / 2,998. CI GREEN on D42 (run 36831959942). Flip-diff **+1, zero LOST,
> zero RETIERED** (tier snapshots at d073d334 → the change: Umbra Mystic body-only → native-static). **Mutants 5/5** on the final code (restore byte-identical).
> · **The grant** (CR 702.89a): a coverage marker for "Auras attached to permanents you control have umbra armor.", and
>   `gameState.totemArmorAuraFor` — the ONE reader both destruction sites already use (the lethal-damage SBA and
>   applyDestroyEffect) — now also returns an Aura without the printed keyword when the HOST's controller controls the
>   grant. Any Aura on that player's permanents counts, whoever controls it (an opponent's Pacifism is spent instead); an
>   Equipment never does; nothing on another player's permanent does. The grant is read once, only when needed.
> · **Citations corrected:** umbra armor is CR 702.89, but 12 sites cited 702.116 (Myriad), and one comment had the renaming
>   backwards — 702.89b: "totem armor" is the OLDER printed name, "umbra armor" the current one.
> · **Fixture note:** Doom Blade's "nonblack" reads the printed `colors` array and fails closed without it (deliberate); the
>   card index carries it, so the Bear fixture does too.
> · **Runtime:** `WITNESS umbraMystic {"hostAlive":true,"hand":["Rancor"],"graveyard":[]}` — Doom Blade destroys Rancor
>   instead and Rancor returns to hand · without the Mystic the Bear dies · Lightning Bolt's lethal damage spends the AI's
>   Pacifism and clears the damage · your Rancor on the AI's Bear doesn't save it · Bonesplitter doesn't. Witness
>   `app/src/lib/learn/umbraMystic.test.js` (7).
> · **Next:** Light-Paws 89 needs 1 — Pearl-Ear (two lines) or one from the deep pile.

> ## 🃏 2026-10-01 — SHELF DECKS · D42: DAMAGE TO YOU IS DEALT TO A CREATURE INSTEAD — Light-Paws Voltron 86 → 88 · **+5** · corpus 15,160 / 34,245 (44.3%)
> Suite **1,692 files / 17,405 tests** green (1 skipped); lint 0; decks 2,718 / 2,998. CI GREEN on D41 (run 36829379830). Flip-diff **+5, zero LOST,
> zero RETIERED** (tier snapshots at bec07f14 → the change: With Great Power . . . and Pariah body-only → native-aura; Pariah's Shield → native-equipment; Empyrial Archangel → native-static; Protector of the Crown → native-mixed). **Mutants 20/20** on the final code (restore byte-identical).
> · **One line, three gates:** "All damage that would be dealt to you is dealt to enchanted / equipped / this creature instead."
>   (CR 614.9). staticAbilityParser.playerDamageRedirectLine is the one recognizer — the Aura gates (the bonus walker skip, the
>   touch walk, the modeled-payload check: Pariah's whole payload), the Equipment gate (a line strip, like the except-by line)
>   and a coverage marker for the creature form all read it. A filter (Veteran Bodyguard), a condition or a wider scope
>   (Palisade Giant) never matches.
> · **The runtime** (new leaf `learn/damageRedirect.js`): the first redirect on the player's battlefield names the creature;
>   it must be a creature on the battlefield right now (CR 614.9). Non-combat (`hitPlayer`): an ordinary hit on that creature,
>   with a per-opponent amount (Molten Psyche) carried — but never onto a creature with ANY protection, since the spell's colours
>   aren't threaded there (the player takes it: an under-delivery). Combat (`spillToDefender`): the deal an attacker makes to a
>   blocker — protection, Maze of Ith's stamp, a shield counter, the creature-side consult, deathtouch, infect/wither, the
>   dealt-by record — and NO combat-damage-player event, so no commander damage, no monarch steal, no player-damage trigger.
>   Applied first, a legal CR 616.1 order. Wolverine's dealt-to-a-creature arm is not set (an under-delivery, unwitnessed).
> · **Caught in review:** the first Pariah's Shield witness used Empyrial Archangel as the host — whose OWN redirect sends the
>   Bolt to the same place, so the Shield proved nothing. Re-hosted on a Bear.
> · **A negative graduated:** flashAuraAndCondUnblock.test.js kept Pariah's line as its REAL unmodeled clause; the probe is now
>   positive, and the negative is Benevolent Blessing (a printed Flash Aura; chosen-colour protection is still unmodeled).
> · **Runtime:** `WITNESS playerDamageRedirect {"userLife":40,"hostDamage":2}` · Scroll Thief (a commander) draws nothing and
>   deals no commander damage · Typhoid Rats kills the 4/4 · Glistener Elf: a -1/-1 counter, no poison · Sengir Vampire grows ·
>   Mirran Crusader, a shield counter, a Maze stamp and a prevention shield each stop it · Pariah on an OPPONENT's Bear kills it.
>   Witness `app/src/lib/learn/playerDamageRedirect.test.js` (18).
> · **Next:** Light-Paws 88 needs 2 — Pearl-Ear (two lines), then one from the deep pile.

> ## 🃏 2026-10-01 — SHELF DECKS · D41: MANTLE OF THE ANCIENTS — AURAS AND EQUIPMENT RETURN ATTACHED — Light-Paws Voltron 85 → 86 · **+1** · corpus 15,155 / 34,245 (44.3%)
> Suite **1,691 files / 17,387 tests** green (1 skipped); lint 0; decks 2,716 / 2,998. CI GREEN on D40 (run 36827909736). Flip-diff **+1, zero LOST,
> zero RETIERED** (tier snapshots at 17436c26 → the change: Mantle of the Ancients body-only → native-aura). **Mutants 10/10** on the final code (restore byte-identical).
> · **The atom** (atoms/zones.js `return-attached-from-graveyard`): the chosen Aura and Equipment cards still in your graveyard
>   (CR 608.2b) enter attached to the Mantle's host. An Aura whose own Enchant line can't take that host stays behind (CR 303.4i);
>   nothing enters onto a host with protection from one of its colours (CR 702.16c/d); Equipment enters first, so a returning
>   Sword's protection keeps a same-colour Aura in the graveyard instead of wrongly attached (the engine's sweep does not apply
>   CR 702.16c). No host (the Mantle gone before its trigger resolves) → nothing returns.
> · **One reader, moved:** `auraMayEnchantCreature` left atoms/stack.js VERBATIM for a new leaf, `learn/auraHost.js` — stack.js
>   imports zones.js, so zones.js could not import it back. Attach-to-triggering, attach-pair and the Mantle now share it.
> · **The hollow gate caught one:** with Wild Growth alone, dropping the Enchant-line check SURVIVED — the sweep kills an
>   "Enchant land" Aura on a Bear right after it enters, so the end state matched. Stasis Cocoon ("Enchant artifact", which the
>   sweep leaves alone) now pins the check.
> · **Runtime:** `WITNESS mantleOfTheAncients {"attached":["Bonesplitter","Mantle of the Ancients","Rancor"],"graveyard":["bear2","cocoon","growth"],"size":[9,5],"trample":true}`
>   · Mirran Crusader keeps Rancor and Bloodthorn Flail off (6/4 with Bonesplitter) · a returning Sword of Feast and Famine keeps
>   Rancor in the graveyard (6/6, protection from black and green) · an exiled target stays exiled · no Mantle, no return. Witness
>   `app/src/lib/learn/mantleOfTheAncients.test.js` (8).
> · **Next:** Light-Paws 86 needs 4 — With Great Power . . . (one line), Pearl-Ear (two), then two from the deep pile.

> ## 🃏 2026-09-30 — SHELF DECKS · D40: CELESTIAL MANTLE — DOUBLE ITS CONTROLLER'S LIFE TOTAL — Light-Paws Voltron 84 → 85 · **+1** · corpus 15,154 / 34,245 (44.3%)
> Suite **1,690 files / 17,379 tests** green (1 skipped); lint 0; decks 2,715 / 2,998. CI GREEN on D39 (run 36826874295). Flip-diff **+1, zero LOST,
> zero RETIERED** (tier snapshots at 8181194f → the change: Celestial Mantle). **Mutants 6/7 (the survivor equivalent)** on the final code (restore byte-identical).
> · **The atom** (atoms/life.js `double-life`, CR 701.10d): the player gains or loses the amount that makes their total twice what it
>   was — a positive total GAINS (lifegain triggers fire, CR 119.3), a negative one LOSES, zero changes nothing. An absent referent
>   is a no-op, never the ability's controller.
> · **The referent** (triggers.js): "its controller" is the ENCHANTED creature's. detectTriggers rewrites the whole clause to the
>   triggering-permanent sentinel for an attached combat-damage trigger, and checkCombatDamageTriggers binds the attacker as the
>   triggering permanent — so a Mantle on an opponent's creature doubles THEIR life.
> · **Left unread on purpose:** "double your life total" (Enduring Angel, A Good Thing) and "double target player's life total"
>   (Beacon of Immortality) — each of those cards parks on other text, so no witness could prove the arm; it waits for one.
> · **Runtime:** `WITNESS celestialMantle {"userLife":74,"aiLife":40,"yourPridemate":1,"theirPridemate":0}` · on the opponent's
>   creature their 21 becomes 42 · under Platinum Angel −5 becomes −10 with no lifegain · 0 stays 0. Witness
>   `app/src/lib/learn/celestialMantle.test.js` (6). The one surviving mutant (a zero total "gaining" 0) is equivalent: a zero
>   gain is already a no-op that fires no trigger.
> · **Next:** Light-Paws 85 needs 5 — Mantle of the Ancients, With Great Power . . . (one line each), Pearl-Ear (two), then two
>   from the deep pile.

> ## 🃏 2026-09-30 — SHELF DECKS · D39: EIGANJO CASTLE — PREVENT THE NEXT 2 DAMAGE TO TARGET LEGENDARY CREATURE — Light-Paws Voltron 83 → 84 · **+1** · corpus 15,153 / 34,245
> Suite **1,689 files / 17,373 tests** green (1 skipped); lint 0; decks 2,714 / 2,998 (the aggregate reads 91% now). CI GREEN on D38 (run 36825867218).
> Flip-diff **+1, zero LOST, zero RETIERED** (tier snapshots at ed13fdff → the change: Eiganjo Castle). **Mutants 4/4** on the final
> code (restore byte-identical).
> · **The arm** (atoms/combat.js): the chosen-creature prevention shield (CR 615.7) — already modeled for "target creature" and
>   "target artifact creature" — gains the supertype-narrowed sibling (legendary, CR 205.4a) on the restriction the enumerator
>   already enforces. Eiganjo Castle goes land-partial → land.
> · **Runtime:** `WITNESS eiganjoCastle {"castleTapped":true,"isamaruAlive":true,"damage":1}` — the shield turns a Lightning Bolt on
>   Isamaru into 1 damage (the control: the same Bolt kills him); offered on both players' legendary creatures, never the Bears.
>   Witness `app/src/lib/learn/eiganjoCastle.test.js` (5).
> · **Banked, not built:** Kitsune Healer's "Prevent ALL damage that would be dealt to target legendary creature this turn" — the
>   "prevent all … target creature" shape is unmodeled for any target; a corpus vein, not a shelf slot.
> · **Next:** Light-Paws 84 needs 6 — Celestial Mantle, Mantle of the Ancients, With Great Power . . . (one line each), Pearl-Ear
>   (two), then two from the deep pile.

> ## 🃏 2026-09-30 — SHELF DECKS · D38: FBLTHP, LOST ON THE RANGE — PLOT FROM THE TOP OF THE LIBRARY — Kellan of the West 89 → 90 — **28 of 30 at ≥90** · **+1** · corpus 15,152 / 34,245
> Suite **1,688 files / 17,368 tests** green (1 skipped); lint 0; decks 2,713 / 2,998. CI GREEN on D37 (run 36824797329). Flip-diff **+1, zero LOST,
> zero RETIERED** (tier snapshots at 9ed58e1c → the change: Fblthp, Lost on the Range). **Mutants 9/9** on the final code (restore byte-identical).
> · **The markers** (staticAbilityParser.js): "The top card of your library has plot" / "The plot cost is equal to its mana cost" /
>   "You may plot nonland cards from the top of your library" → topCardHasPlot / plotCostIsManaCost / plotNonlandFromTop.
>   plotFromLibraryTopGranted needs all three on one permanent; the classifier credits each sentence on its own, which is honest
>   only because Fblthp is the sole card printing any of them.
> · **The offer** (legalChoices.actionsPlotFromLibraryTop, CR 702.170f): the top card, at the plot special action's own timing
>   (CR 702.170a — main phase, empty stack), for its printed mana cost. A costless card has an unpayable plot cost (CR 118.6) — which
>   is also what keeps a land out ("nonland") — and an {X} cost is not offered. The dispatcher (applyPlot) exiles it from the
>   library and refuses any card below the top; the plotted card casts free on a later turn through the existing lane (CR 702.170d).
> · ⚠️ **Plot citations corrected:** 29 comments cited CR 702.171 / 702.171a / 702.171b for Plot — in the bundled CR, 702.171 is
>   SADDLE; Plot is 702.170 (a = the special action, d = the free cast from exile, f = plotting outside the hand). The checker only
>   asks that a number exists, so a wrong-but-real rule passed. One comment also claimed a rule forbids plotting lands; none does.
> · **Runtime:** `WITNESS fblthp {"offer":[{"card":"top","from":"library","cost":"2+U1"}],"plotted":{"plotted":true,"turn":5},"library":["w0","w1","w2","w3"],"poolU":0,"sameTurn":[],"nextTurn":["top"],"drew":2,"graveyard":["top"]}`
>   · not offered for a land, without Fblthp, off-turn, for an {X} or costless card · the permission sentence alone grants nothing.
>   Witness `app/src/lib/learn/fblthpLostOnTheRange.test.js` (5).
> · **Next:** Light-Paws 83 needs 7 — Celestial Mantle, Eiganjo Castle, Mantle of the Ancients, With Great Power . . . (one line
>   each), Pearl-Ear (two), then two from the deep pile. Atraxa stays deferred.

> ## 🃏 2026-09-30 — SHELF DECKS · D37: ELADAMRI, KORVECDAL — REVEAL FROM HAND OR THE LIBRARY TOP, PUT A CREATURE ONTO THE BATTLEFIELD — Kellan of the West 88 → 89 · **+1** · corpus 15,151 / 34,245
> Suite **1,687 files / 17,363 tests** green (1 skipped); lint 0; decks 2,712 / 2,998. CI GREEN on D36 (run 36823605870). Flip-diff **+1, zero LOST,
> zero RETIERED** (tier snapshots at 402f9747 → the change: Eladamri, Korvecdal). **Mutants 9/9** on the final code (restore byte-identical).
> · **The fold** (splitClauses.js): "Reveal a card from your hand or the top card of your library. If you reveal a creature card this
>   way, put it onto the battlefield." → one clause; putFromHand.js reads it as the hand → battlefield tutor with `sourceZones:
>   ["hand", "libraryTop"]` and `revealChoice`. Eladamri's cost (tap two untapped creatures) and "Activate only during your turn" were
>   already modeled.
> · **The `libraryTop` pseudo-zone** (applyTutor, setPendingTutorChoice, autoPickTutorCandidate): ONLY the top card of the library,
>   revealed rather than searched — its candidate moves as a library card, and the settle's shuffle test (`sourceZones` holds
>   "library") never fires, so the rest of the library keeps its order and no library-search trigger runs.
> · **revealChoice:** revealing a noncreature puts nothing, so the put may be declined only when the hand or the top card holds a
>   noncreature to reveal; with nothing but creatures to reveal, one must be put (`mayFailToFind` false — a null pick is refused).
> · **Runtime:** `WITNESS eladamri {"tapped":["B1","B2","EL"],"candidates":["handBear@hand","topAngel@library"],"mayDecline":true,"entered":true,"library":["l2","l3","l4","l5","l6"]}`
>   · a creature second from the top is never a candidate · all-creature reveal: the decline is refused and the auto-pick takes the
>   best · not offered on an opponent's turn. Witness `app/src/lib/learn/eladamriKorvecdal.test.js` (6).
> · **Next:** Kellan 89 needs 1 — Fblthp, Lost on the Range or Bonny Pall, Clearcutter (two lines each), or Transcendent Dragon
>   (casting a card you don't own from another player's exile — a new capability). Then Light-Paws 83 (needs 7).

> ## 🃏 2026-09-30 — SHELF DECKS · D36: SAKASHIMA'S PROTEGE — A COPY OF ANY PERMANENT THAT ENTERED THIS TURN — Kellan of the West 87 → 88 · **+1** · corpus 15,150 / 34,245
> Suite **1,686 files / 17,357 tests** green (1 skipped); lint 0; decks 2,711 / 2,998. CI GREEN on D35 (run 36821724279). Flip-diff **+1, zero LOST,
> zero RETIERED** (tier snapshots at 7a91dd7f → the change: Sakashima's Protege). **Mutants 6/6** on the final code (restore byte-identical).
> · **The scope** (cloneCopy.js): "any permanent that entered this turn" → `anyPermanentEnteredThisTurn` — the widened nonland pool
>   (never a land, an Aura or a Saga: the narrower-is-safe pool Clever Impersonator uses) narrowed to permanents whose `enteredOnTurn`
>   stamp is this turn, any controller. One helper, `enteredThisTurnCopiable`, serves the enumerator AND the resolution-time re-check
>   (resolvers.resolveCloneChoice, CR 707.9c), so the two cannot drift.
> · **Cascade** joins Flash in the clone parser's consumed leading keywords: the cast path keeps running it (CR 702.85a), and the
>   witness proves it — flashed in on the opponent's turn, the cascade found the Bolt under an Island before the copy pause.
> · **Runtime:** `WITNESS sakashimasProtege {"cascadeFound":"bolt","pause":"clone-search","pool":["ANGEL","SOL"],"became":"Serra Angel","size":[4,4]}`
>   · the pool includes a Bear the engine stamped on its own entry this turn · a pick from outside the pool enters as itself.
>   Witness `app/src/lib/learn/sakashimasProtege.test.js` (5).
> · **Next:** Kellan 88 needs 2 — Eladamri (the tutor seam's zone union plus a library-TOP pseudo-zone: a reveal, so no shuffle;
>   must-put when every option is a creature), then Transcendent Dragon (needs casting a card you don't own from another player's
>   exile — a new capability) or Fblthp / Bonny Pall (two lines each). Then Light-Paws 83 (7).

> ## 🔧 2026-09-30 — sync-spellbook: the card crawl resumes by oracleId (1e5e0975)
> Spellbook leaves `id` null on every card in no combo, and the script keyed identity on `id` (the reload's de-duplication, the
> resume offset, the progress line and the meta count), so every run restarted near offset 3,100. Now `cardKey` = oracleId, else the
> normalized name. A `fresh` dispatch input passes --fresh once, to refill the null-id cards below offset 3,100 that every earlier
> reload dropped. Witness `app/scripts/syncSpellbookExit.test.js` (3; the stub serves four null ids in five; the second run resumes
> at offset 200 and ends with 300); mutants 3/3. **Fresh run 36822661299 (dispatched with fresh=true): offsets 0 → 9,900 with 9,900 unique cards saved — one per row, as the identity now counts — then the 429; green with the warning. The next run resumes at 9,900.**

> ## 🃏 2026-09-30 — SHELF DECKS · D35: CAST IT WITHOUT PAYING ITS MANA COST — One with the Multiverse, Zaffai, Vision, Omniscience — Kellan of the West 86 → 87 · **+4** · corpus 15,149 / 34,245
> Suite **1,685 files / 17,351 tests** green (1 skipped); lint 0; decks 2,710 / 2,998. CI GREEN on D34 (run 36815067747). Flip-diff **+4, zero LOST,
> zero RETIERED** (tier snapshots at 387b9a0f → the change: One with the Multiverse, Vision, Spectral Synthezoid, Zaffai and the Tempests, Omniscience). **Mutants 11/11** on the final code (restore byte-identical).
> · **The permission** (staticAbilityParser.js): `{ freeCastPermission: { oncePerYourTurn, fromTop, filter } }` — "Once during each of
>   your turns, you may cast a spell from your hand[ or the top of your library] without paying its mana cost" with the filters
>   "a spell" / "an instant or sorcery spell" / "a noncreature or Robot spell", and Omniscience's unlimited "You may cast spells from
>   your hand without paying their mana costs." Any other filter parks. CR 118.9: an alternative cost of nothing.
> · **The offer** (legalChoices.actionsCastFreeByPermission): the shared builder's freeCast mode skips timing (it was built for casts
>   made during a resolution — cascade, discover), so each card is first held to the timing a paid cast would need. A once-source
>   offers only on its controller's turn and latches per source (`${id}_freeCastOnce`, set by the dispatcher, cleared at untap — the
>   Raul / Rivaz latch). An unlimited grant covers a card first, and a card is offered free once, never once per grant.
> · **Runtime:** `WITNESS oneWithTheMultiverse {"before":{"hand":["bears","div"],"library":["bolt"]},"hand":["bears","bolt","w0"],"graveyard":["div"],"latched":true,"after":{}}`
>   · the untap step clears the latch · nothing on an opponent's turn · in combat only the instant · Zaffai / Vision filters · two
>   once-sources give two free casts · Omniscience: no once, an instant free off-turn. Witness `app/src/lib/learn/freeCastPermission.test.js` (11).
> · **Next:** Kellan 87 needs 3 — Transcendent Dragon, Eladamri, Sakashima's Protege (spares Fblthp, Bonny Pall); then Light-Paws 83 (7).

> ## 🔧 2026-09-30 — sync-spellbook: a rate-limited crawl that saved progress ends green with a warning (9a9005db)
> Colton asked how to stop the "All jobs have failed" emails. The script exits 75 when a 429 stops a card crawl that saved pages this
> run (1 otherwise); the workflow warns on 75 and fails on everything else; daily schedule. Witness `app/scripts/syncSpellbookExit.test.js`
> (2; mutants 2/2). **Live run 36820617700: green with the warning, no email** (CI 36820600290 green).
> ⚠️ **The live run exposed the real reason the crawl never finishes:** Spellbook returns `id: null` for every card that is in no combo
> (81 of 100 on the page at offset 9,000), and the resume logic counted and de-duplicated by `id` — so each reload kept ONE null-id card,
> the crawl restarted near offset 3,100, and the saved count read 3,183 from offset 3,100 to 12,700. Fix in the next commit: key the
> card identity on oracleId (name as the fallback), plus a dispatch input for one fresh crawl to fill the hole the old reloads left.

> ## 🚀 2026-09-30 — v0.161.0 RELEASED · 449 commits since v0.160.0 · corpus 38.6% → 44.2% (15,145) · shelf 27 of 30 at ≥90
> Colton moved the tag up from 10-02: Reality Fracture's whole card base was already on Scryfall (fra 461 cards, frc 103), so a
> release built now bundles it. Steps (RELEASE.md + RELEASE-READINESS §7): the Node pin checked (v22.23.2; v22 is LTS to
> 2027-04; v22.23.3 is a non-security patch) · sync-spellbook re-dispatched (run 36816095158: the per-card crawl 10,100 →
> 12,900, then Spellbook's 429; progress cached; red by design) · `[Unreleased]` → `[0.161.0] - 2026-09-30` (502e133f; CI
> 36816204422 green) · `git tag v0.161.0` on 502e133f + push · release run 36817109773 green (test ×2 + build) · published
> 05:26Z, marked Latest · `latest.json` verified BY CONTENT at the updater endpoint (0.161.0, 420-char signature, the
> v0.161.0 installer URL) · the bundle: fresh Scryfall (38,705 oracle records), Spellbook combos 112.8 MB + cards 6.0 MB +
> index 7.8 MB, EDHREC salt, the rules index; the strict guard passed. ⏸ Last acceptance waits on the box's app update:
> `/api/sync-data` must report the bundle (before: every dataset 2026-07-19, 74 days, stale).

> ## 📜 2026-09-30 — POLICY: THE THEFT HARD-PARK IS LIFTED FOR CARDS (Colton)
> Colton, during the "Do my decks" pause: remove the hard park on theft cards; he simply won't submit theft decks, so nothing
> gets gated card by card (his examples: Gilded Drake, Eriette's Tempting Apple, Transcendent Dragon). The 2026-08-15 veto now
> reads as it was first worded: no theft-THEMED deck goes on the shelf as training data. Control-changing and cast-their-card
> effects are ordinary cards, built when their deck or vein comes up — Gilded Drake (Kinnan), Eriette's Tempting Apple (Bumble
> Flower), Commandeer (Believe it!), Kellogg, Nautiloid Ship (Shorikai), Transcendent Dragon and Mind's Dilation (Kellan), Oko's
> −5 and Bringer of the Red Dawn. Updated: SHELF-85-RUNBOOK §1.2 + its ⛔ THEFT rows (now open), SHELF-85-OMNATH-HANDOFF, the
> OVERNIGHT-PLAN-2026-09-06 standing line, and the shelf-residue-map exclusions note. Dated plans and archived entries keep their
> original wording as history. No engine code gated theft — the control-change guards (controlAura, the revert sweep) are
> correctness guards and stay.
> **Same pause — planeswalkers last; Atraxa deferred (Colton).** Walkers become their own program at the end (the corpus has
> 318: 24 native, 162 already playing through their modeled abilities with the rest sent to the Arbiter, 132 wholly Arbiter;
> 34 sit one ultimate from native). Atraxa's role on the test bench was the walkers, so she waits at 74 and the shelf does not
> build toward 90 there; a walker on a future test deck is taken case by case. The shelf target is now Kellan (86, needs 4)
> and Light-Paws (83, needs 7). Recorded in SHELF-85-RUNBOOK §5.9.

> ## 🃏 2026-09-30 — SHELF DECKS · D34: THE REALITY CHIP — PLAY FROM THE TOP WHILE ATTACHED · ⚠️ RECONFIGURE NO LONGER TARGETS ITSELF — Kellan of the West 85 → 86 · **+1** · corpus 15,145 / 34,245
> Suite **1,683 files / 17,338 tests** green (1 skipped); lint 0; decks 2,709 / 2,998. CI GREEN on D33 (run 36813454252). Flip-diff **+1, zero LOST,
> zero RETIERED** (tier snapshots at 96657d56 → the change: The Reality Chip). **Mutants 6/6** on the final code (restore byte-identical).
> · **The permission** (staticAbilityParser.js): "As long as The Reality Chip is attached to a creature, you may play lands and cast
>   spells from the top of your library" is Future Sight's playFromTop marker with attachedGated; playFromTopPermission re-reads the
>   source's attachedTo at every offer (the Conqueror's Flail split). An Equipment on a non-creature is unattached by SBA (CR 704.5n).
> · **The Equipment residue loop** (coverage.js) also asks the static grammar about a clause in its self-normalized form — it reads
>   raw clauses, where the card's own name was unknown text (the runtime parser always saw "this creature").
> · ⚠️ **Found on the way — reconfigure offered the Equipment as its own target** (legalChoices.js): an Equipment can't equip itself
>   (CR 301.5c) and reconfigure attaches to ANOTHER creature (CR 702.151a). The self-attach paid its cost and SBA unattached it at once.
>   Every reconfigure card had it (a reconfigure Equipment is a creature while unattached, so it sat in its own pool).
> · **sba.js citations corrected:** the Equipment unattach is CR 704.5n and an Aura to the graveyard is 704.5m — the two comments had
>   them swapped (behavior unchanged).
> · **Runtime:** `WITNESS realityChip {"attached":{"attachedTo":"BEAR","creature":false,"offers":["cast-spell:div"]},"afterCast":{"hand":["w0","w1"],"graveyard":["div"],"offers":["play-land:isl"]},"islandOnBattlefield":true,"libraryTop":"w2"}`
>   · the Bear leaves → SBA unattaches the Chip → no offer. Witness `app/src/lib/learn/realityChip.test.js` (5).
> · **Next:** Kellan 86 needs 4 — One with the Multiverse, Eladamri, Sakashima's Protege, Transcendent Dragon, then Fblthp / Bonny Pall.
>   **Colton (09-30): Transcendent Dragon is in.** The theft ban is a deck THEME; a single card in a non-theft deck is fine.

> ## 🃏 2026-09-30 — SHELF DECKS · D33: KATSUMASA, THE ANIMATOR — A VEHICLE KEEPS ITS SIZE, ANYTHING ELSE IS 1/1 — Shorikai Vehicles 89 → 90 — **27 of 30 at ≥90** · **+1** · corpus 15,144 / 34,245
> Suite **1,682 files / 17,333 tests** green (1 skipped); lint 0; decks 2,708 / 2,998. CI GREEN on D32 (run 36812307458). Flip-diff **+1, zero LOST,
> zero RETIERED** (tier snapshots at 20fdca19 → the change: Katsumasa, the Animator). **Mutants 9/9** on the final code (restore byte-identical).
> · **The fold** (splitClauses.js): "…becomes an artifact creature and gains flying. If it's not a Vehicle, it has base power and
>   toughness 1/1 until end of turn." sizes ONE target, so the period folds to a comma (the Mana Drain precedent) and a keep-whole
>   guard keeps the folded sentence's " and gains" internal. Split apart, neither half parsed (no size; a rider with no antecedent).
> · **ptUnlessVehicle** (atoms/combat.js): the animate's layer-7b base P/T set is skipped when the target's live subtypes include
>   Vehicle at resolution — a Vehicle that becomes a creature has its printed power and toughness (CR 301.7b); anything else is 1/1.
> · **The upkeep counters** (atoms/counters.js): "put a +1/+1 counter on each of up to three target noncreature artifacts" rides the
>   multi-count add-counter atom over the layer-aware noncreatureArtifact pool (any controller, as printed; the +1/+1 own-intent
>   chooser feeds only yours). The counter waits on the artifact and counts once it is a creature (CR 122.1a).
> · **Runtime:** `WITNESS katsumasa {"waiting":{"counters":1,"creature":false},"opponentCounters":0,"creature":true,"size":[2,2],"flying":true}`
>   · Untethered Express animates at its printed 4/4 with flying and trample. Witness `app/src/lib/learn/katsumasaAnimator.test.js` (8).
> · **Next:** Kellan 85 (5), Light-Paws 83 (7), Atraxa 74 (16).

> ## 🃏 2026-09-30 — SHELF DECKS · D32: MU YANLING — THE VEHICLE TOKEN AND "VEHICLES YOU CONTROL HAVE FLYING" — Shorikai Vehicles 88 → 89 · **+3** · corpus 15,143 / 34,245
> Suite **1,681 files / 17,325 tests** green (1 skipped); lint 0; decks 2,707 / 2,998. CI GREEN on D31 (run 36810770575). Flip-diff **+3, zero LOST,
> zero RETIERED** (tier snapshots at 4d33ea7f → the change: Mu Yanling, Wind Rider, Aeronaut Admiral, Wish Good Luck). **Mutants 8/8** on the final code (restore byte-identical).
> · **Vehicle token** (tokens.js): "create a 3/2 colorless Vehicle artifact token with crew 1" mints an ARTIFACT, not a creature —
>   it has its printed P/T only while crewed (CR 301.7a, 702.122a) — with an explicit "Token Artifact — Vehicle" type line (an
>   atom tokenType that wins over the creature-token derivation) and its Crew line as oracle, so the crew offer reads it like a
>   printed Vehicle; its name is its subtype (CR 111.4). An attacking rider is refused, never dropped (pinned on the clause
>   parser directly — the splitter cuts "tapped and attacking" before a full parse could deliver it).
> · **Vehicle keyword grant** (staticAbilityParser.js): "Vehicles you control have <keyword>" rides the SAME Artifact + Vehicle
>   selector as Kotori's crew grant, so every Vehicle you control has it, crewed or not. NON_CREATURE_SUBTYPES had excluded the
>   line because the tribal selector is creature-restricted and reached no Vehicle (the Aeronaut Admiral false positive); that
>   premise is gone with this selector, so Aeronaut Admiral flips too — verified: your Vehicle flies, the opponent's does not.
> · **Four pins updated, their jobs kept:** groupGrant / kotoriPilotProdigy / padeemConsulOfInnovation / multiSubtypeListAnthem
>   pinned "Aeronaut Admiral stays parked" on the premise "crew unmodeled; the creature selector reaches no Vehicle". Food /
>   Treasure / Equipment / Clue grants still drop (pinned), the tribal guard's pin now uses "Foods", and Vehicles pin the new selector.
> · **Runtime:** `WITNESS muYanling {"type":"Token Artifact — Vehicle","name":"Vehicle","creature":false,"flies":true,"crewOffered":1,"crewedCreature":true,"pt":[3,2],"crewedFlies":true}`
>   · Wish Good Luck: a Food, a tapped Treasure and the crew-1 Vehicle. Witness `app/src/lib/learn/vehicleTokenAndGrant.test.js` (5).
> · **Next:** Shorikai 89 needs 1 (Katsumasa · Windbrisk Heights — two lines each); Kellan 85 (5); Light-Paws 83 (7); Atraxa 74 (16).

> ## 🃏 2026-09-30 — SHELF DECKS · D31: "YOU MAY CAST THIS CARD FROM YOUR GRAVEYARD AS LONG AS …" — Shorikai Vehicles 87 → 88 · **+3** · corpus 15,140 / 34,245
> Suite **1,680 files / 17,321 tests** green (1 skipped); lint 0; decks 2,706 / 2,998. CI GREEN on D30 (run 36809982128). Flip-diff **+3, zero LOST,
> zero RETIERED** (tier snapshots at 8d74472c → the change: The Indomitable, Gravecrawler, Tend the Sprigs). **Mutants 7/7** on the final code (restore byte-identical).
> · **Build:** an ability that works FROM the graveyard (CR 113.6b) — staticAbilityParser emits a castSelfFromGraveyard marker
>   carrying its condition; legalChoices offers the card from its owner's graveyard through the shared builder while the
>   condition holds as the cast begins (CR 601.3), read by evaluateInterveningIf. The static parser asks the SAME reader whether
>   it can read the condition — INJECTED (registerSelfGraveyardCastConditionReader, registered by coverage.js), because
>   interveningIf → layers → staticAbilityParser makes a direct import a cycle; unregistered fails closed. The reader's type
>   union now reads "and/or" (The Indomitable's "three or more tapped Pirates and/or Vehicles": either or both counts once).
> · **Unaimed gain verified:** Tend the Sprigs — the "and/or" union made its "seven or more lands and/or Treefolk" readable;
>   in play the fetched land makes seven → a 3/4 Treefolk, five Forests and a Treefolk make seven too, five alone → none.
> · **Process slip caught and corrected:** I edited interveningIf.js (this slice) while D30's full suite was still running,
>   so that run tested a tree D30 would not commit. The edit was set aside as a patch, D30 re-ran on its exact tree (identical
>   1,679 / 17,316) before commit, and the patch was re-applied here. Also caught: a test fixture's oracle I had first written
>   from memory (Marang River Prowler) was replaced with the bundled text before use.
> · **Runtime:** `WITNESS indomitable {"withThree":["indom"],"withTwo":[],"resolved":true,"leftGraveyard":true}` (one of the
>   three untapped → not offered) · `WITNESS tendTheSprigs {"sixLands":1,"fiveAndTreefolk":1,"fiveAlone":0}` · Gravecrawler
>   castable with a Zombie, not without · Marang River Prowler ("a black or green permanent" — unreadable) stays parked.
>   Witness `app/src/lib/learn/selfGraveyardCast.test.js` (5).
> · **Next:** Shorikai 88 needs 2 (Mu Yanling · Katsumasa · Windbrisk Heights — each two lines); Kellan 85 (5); Light-Paws 83 (7);
>   Atraxa 74 (16).

> ## 🃏 2026-09-30 — SHELF DECKS · D30: "YOU MAY CAST THAT CARD THIS TURN" — THE GRAVEYARD CAST PERMISSION — Shorikai Vehicles 86 → 87 · **+2** · corpus 15,137 / 34,245
> Suite **1,679 files / 17,316 tests** green (1 skipped); lint 0; decks 2,705 / 2,998. CI GREEN on D29 (run 36808430702). Flip-diff **+2, zero LOST,
> zero RETIERED** (tier snapshots at 22fb7e87 → the change: Emry, Lurker of the Loch, Silas Renn, Seeker Adept). **Mutants 8/8** on the final code (restore byte-identical).
> · **Build:** zones.js — "You may cast target <filter> card from your graveyard this turn" and "Choose target <filter> card in your
>   graveyard. You may cast that card this turn" are ONE atom (matched whole — a rider after it stays LOW). The permission lives in
>   state.gyCastPermissions by CARD ID, never on the card, and gameState.recordGraveyardEvents — the single graveyard-event
>   chokepoint — ends it on ANY event for that card (cast, returned, exiled, or a fresh arrival is a new object, CR 400.7), so an
>   instant cast this way and back in the graveyard is never recast on the same permission. legalChoices offers the cast through
>   the shared graveyard builder (full cost, targets, timing — CR 601.3), this turn only. atomTargetIntent "gy-cast-permission"
>   → own (Silas Renn's combat-damage trigger).
> · **Mutation found three soft spots:** a next-turn test passed vacuously (the mana pool empties between phases — refilled, now it
>   kills the turn mutant); an !isLand filter was redundant (the builder never casts a land — removed); the target-left guard is
>   measured inert (the stack fizzles the ability first, CR 608.2b — kept against a crash, documented).
> · **Runtime:** `WITNESS emry {"targets":["stone","thopter"],"before":[],"offered":["stone"],"onField":true,"stillInGraveyard":false}` —
>   only artifact cards targeted; only the chosen one castable; it resolves. Cast, sacrificed and back the same turn: not castable
>   again. An artifact LAND is a legal target but is never cast. Gone by the next turn. Silas Renn connects → the artifact card
>   in your graveyard is castable. Witness `app/src/lib/learn/graveyardCastPermission.test.js` (7).
> · **Next:** Shorikai 87 needs 3 (The Indomitable · Mu Yanling · Katsumasa · Windbrisk Heights); Kellan 85 (5); Light-Paws 83 (7);
>   Atraxa 74 (16).

> ## 🃏 2026-09-30 — SHELF DECKS · D29: THE LASTING COPY THAT KEEPS "THIS ABILITY" — THESPIAN'S STAGE — Teval 89 → 90 · **+3** · corpus 15,135 / 34,245
> Suite **1,678 files / 17,309 tests** green (1 skipped); lint 0; decks 2,704 / 2,998 — **26 of 30 at ≥90**. CI GREEN on D28 (run 36807292743). Flip-diff
> **+3, zero LOST, zero RETIERED** (tier snapshots at e38bdb7e → the change: Thespian's Stage, Mizzium Transreliquat, Shameless Charlatan). **Mutants 11/11** on the final code (restore byte-identical).
> · **Build (becomeCopy.js):** the seam read only "… until end of turn"; with no stated duration the copy now LASTS (CR 611.2a).
>   "except it has this ability" keeps the source's printed line on the copy — the retainOwnAbilities rider Sakashima uses — so
>   it can copy again; read ONLY here, never in the shared clone vocabulary (an entering clone printing it would otherwise parse
>   it as a silent no-op); no such line on the source → no copy at all. Subjects "this land" / "this artifact", nouns
>   "target land" / "target artifact".
> · **Pre-existing defect fixed:** the noun map FLATTENED its qualifiers — "another target nonlegendary attacking creature"
>   (Tilonalli's Skinshifter) read as a bare creature target, offering the source itself, legends and non-attackers. Each
>   qualifier is now the restriction the shared satisfier enforces (notSource · the D26 supertype negate · combat attacking).
> · **Unaimed gain verified:** Shameless Charlatan ("Commander creatures you own have '{2}{U}: This creature becomes a copy of
>   another target creature.'") — the commander copies another creature, never itself, the copy lasts, and it stays a commander
>   that still has the grant (CR 903.3 — the commander gate reads the printed card, not the copied values).
> · **Runtime:** `WITNESS thespianStage {"offered":["forest","island","stage"],"now":"Forest","keeps":true,"lostPrintedC":true,"nextTurn":"Forest","offeredLater":true,"again":"Island"}`
>   — it becomes a Forest that keeps its copy ability and loses its printed {C}, is still a Forest a turn later, and becomes an
>   Island. Mizzium Transreliquat: the {3} copy ends at cleanup; the {1}{U}{R} copy lasts and keeps only that ability. Witness
>   `app/src/lib/learn/thespianStageCopy.test.js` (6). becomeCopy.test.js's unlisted-noun pin now names an enchantment (land is listed).
> · **Next:** Shorikai 86 (4 — Emry · The Indomitable · Mu Yanling · Katsumasa); Kellan 85 (5); Light-Paws 83 (7); Atraxa 74 (16).

> ## 🃏 2026-09-30 — SHELF DECKS · D28: SUBTERFUGE — THE TRAILING "UNTIL END OF TURN" QUOTED GRANT — Teval 88 → 89 · **+1** · corpus 15,132 / 34,245
> Suite **1,677 files / 17,303 tests** green (1 skipped); lint 0; decks 2,703 / 2,998. CI GREEN on D27 (run 36806314528). Flip-diff **+1, zero LOST,
> zero RETIERED** (tier snapshots at 64c8b5e4 → the change: Subterfuge). **Mutants 5/5** on the final code (restore byte-identical).
> · **Build:** grantUntilEot.js — TG-1's shapes anchored only the LEADING "Until end of turn, target creature gains …"; the trailing
>   'target creature gains flying and "<body>" until end of turn' is the same grant, so it moves to the front, and the quoted body
>   gets back the period it lost to the outer sentence (the body validators read a whole ability; the trigger-sentence scanner
>   needs its terminator — that missing period, not the grammar, was what kept it LOW). Only a duration OUTSIDE the quote moves.
>   programQueries.js — atomTargetIntent "grant-until-eot" → own (the quoted ability becomes the recipient's own; every body
>   the grant admits is validated against the group-grant vocabulary — a benefit), enemy for a shrinking pump half. It had no
>   case, so the trigger chooser read "ambiguous" and the ETB could never route; spells never consulted it. Flip-diff: only
>   Subterfuge moved. The unwitnessed "creatures you control" trailing subject was removed before the mutation run.
> · **Runtime:** `WITNESS subterfuge {"granted":1,"aiBearFlies":false,"drew":3,"flyingAfterCleanup":false,"who":"sub"}` — the
>   own-side chooser gave the grant to Subterfuge itself (3 power over the Bear's 2), which connected for 3 and drew 3; the
>   opponent's creature never got it; your other creature connecting draws nothing; gone at cleanup. Witness
>   `app/src/lib/learn/subterfuge.test.js` (4).
> · **Next:** Teval 89 needs 1 — Thespian's Stage via "becomes a copy of …, except it has this ability" (15 carriers, none
>   native: Cryptoplasm, Protean Thaumaturge, Artisan of Forms, Mizzium Transreliquat …); Shorikai 86 (4); Kellan 85 (5).

> ## 🃏 2026-09-30 — SHELF DECKS · D27: TEVAL'S MILL PAYOFFS — OVERLORD OF THE BALEMURK + COLOSSAL GRAVE-REAVER — Teval 86 → 88 · **+2** · corpus 15,131 / 34,245
> Suite **1,676 files / 17,299 tests** green (1 skipped); lint 0; decks 2,702 / 2,998. CI GREEN on D26 (run 36804903468). Flip-diff **+2, zero LOST,
> zero RETIERED** (tier snapshots at 78615341 → the change: Overlord of the Balemurk, Colossal Grave-Reaver). **Mutants 14/14** on the final code (restore byte-identical).
> · **Overlord of the Balemurk** — Grapple with the Past's "mill N, then you may return a <filter> card" already parsed; zones.js now
>   reads a UNION OF CARD PHRASES ("a non-Avatar creature card or a planeswalker card") — each a permanent card type, optionally
>   "non-<creature type>" from the closed CR list — into a structured { anyOf: [{ cardType, notSubtype? }] } filter;
>   spellEffects.cardMatchesGraveyardFilter reads anyOf + notSubtype (the shared chokepoint the panel and the AI pick use).
>   A plain two-phrase union still prints the old "a|b" token. An unknown word fails closed: a filter naming no real type would
>   match nothing — a native claim that does nothing (pinned; mutant Z3 survived until that witness existed).
> · **Colossal Grave-Reaver** — Sidisi's batch event ("one or more creature cards are put into your graveyard from your
>   library") already fired; the batch pass now stamps EVERY matching card (ctx.gyBatchCardIds, not only the first), and
>   "put one of them onto the battlefield" picks among those still in the graveyard (CR 400.7e) — none → nothing, one → it enters,
>   several → the milled-pick pause's battlefield destination, most valuable first for the AI. The referent is refused off the
>   gyEnterBatch event (triggerRouting) and on a spell (coverage).
> · **Runtime:** `WITNESS overlordBalemurk {"asked":"optional-effect","milled":["Ajani Goldmane","Forest","Grizzly Bears","Overlord of the Balemurk"],"offered":["Ajani Goldmane","Grizzly Bears"],"hand":["Ajani Goldmane"]}`
>   (never the Avatar, never the land) · `WITNESS graveReaver {"kind":"milled-pick","toZone":"battlefield","offered":["Hill Giant","Grizzly Bears"],"onField":["Colossal Grave-Reaver","Hill Giant"],"graveyard":["Forest","Grizzly Bears"]}`.
>   One creature milled enters with no question; none milled, no trigger; one gone from the graveyard before resolution is no
>   longer a candidate. Witness `app/src/lib/learn/tevalMillPayoffs.test.js` (8).
> · **Next:** Teval 88 needs 2 (Subterfuge · Thespian's Stage · Ardyn · Six); Shorikai 86 needs 4 (Emry · The Indomitable · Mu Yanling ·
>   Katsumasa); Kellan 85 (5); Light-Paws 83 (7); Atraxa 74 (16).

> ## 🃏 2026-09-30 — SHELF DECKS · D26: THE KIKI FAMILY — A TOKEN COPY GONE AT THE NEXT END STEP — Halfshell heroes 89 → 90 · **+5** · corpus 15,129 / 34,245
> Suite **1,675 files / 17,291 tests** green (1 skipped); lint 0; decks 2,700 / 2,998 — **25 of 30 at ≥90**. CI GREEN on D25 (run 36802507179). Flip-diff
> **+5, zero LOST, zero RETIERED** (tier snapshots at 74b116a5 → the change: Tempestra, Dame of Games, Kiki-Jiki, Mirror Breaker, Orthion, Hero of Lavabrink, The Fire Crystal, Stormsplitter). **Mutants 21/21** on the final code (restore byte-identical).
> · **Build:** tokenCopy.js — the target-copy anchor reads "ANOTHER target" (notSource), "target NONLEGENDARY creature" (the
>   supertype restriction gains `negate`), ", except it has haste" (copiable haste, CR 707.9b) and Orthion's "create five tokens that
>   are copies of". tokens.js — the copy stamps the ids it made on EVERY call (empty when it made none, so a follow-on "it" can never
>   read an older effect's tokens); "It gains haste." (folded onto the copy by the parser) is a lasting layer-6 grant on exactly
>   those tokens (no duration stated → CR 611.2a). removal.js — "Sacrifice/Exile it|them at the beginning of the next end step"
>   bakes the minted ids into a [minted-leave] sentinel on the delayed queue (CR 603.7); a sacrifice takes only a token you still
>   control (CR 701.21a), an exile takes it regardless, one already gone is left alone (CR 603.7c). parser.js — the delayed half
>   binds to the copy only directly after it, with the pronoun agreeing ("it" one token, "them" several).
> · **Two pins updated, their concern kept:** token-copy.test.js asserted ", except it has haste" → null because the bare "it has"
>   form usually travels with stat/type riders. The Jolly Balloon Man's real rider text stays pinned null; the exact bare-haste form
>   (Kiki-Jiki) is pinned as the copiable addKeyword rider — Irenicus's proven path.
> · **Latent defect closed before it could flip anything:** "Create a token that's a copy of target creature you control. It gains
>   haste until end of turn." parsed HIGH with the haste bound to the copy's TARGET — the original creature, not the token. No card
>   was native through it (census: 18 carriers, none native), but this slice's anchor widening would have reached some. A referent
>   after a token copy is now refused at assembly; the minted-token folds are the modeled forms.
> · **Hollow-gate catch:** the engine logs a crashing resolver as `stack-resolve-error` instead of throwing, so the first witness
>   passed over a deleted null guard (mutant R3). The settle helpers now throw on one (this file, D25's and D24's — 34 witnesses
>   re-run clean). A dead guard was removed (the modal copy of the referent check: modes parse through the same assembly).
> · **Runtime:** `WITNESS tempestra {"offered":["isamaru"],"token":"Isamaru, Hound of Konda","legendary":false,"haste":true,"bothLegendsStay":true,"ringSacrificed":true,"tokenAfterEnd":false,"isamaruAfterEnd":true}`
>   (another creature you control only; the legend copy isn't legendary so both stay; haste; Sol Ring paid; sacrificed at the end
>   step). Kiki-Jiki offers only a nonlegendary creature you control; with Parallel Lives "it" is both tokens, both sacrificed; a
>   token another player controls is kept (and still hasty next turn, CR 611.2a); Orthion's five; The Fire Crystal; Stormsplitter's
>   copy EXILED, not sacrificed. Witness `app/src/lib/learn/kikiFamilyTokenCopy.test.js` (12).
> · **Found in passing (chip task_4cf7d58e):** the auto-payer spends floating COLORED mana on generic costs before colorless
>   (manaModel's pool drain runs W,U,B,R,G,C) — a {2}{R} from {R:3,C:2} left only colorless.
> · **Next:** the 86s — Shorikai Vehicles and Teval (need 4 each); Kellan 85 (5); Light-Paws 83 (7); Atraxa 74 (16).

> ## 🃏 2026-09-30 — SHELF DECKS · D25: "WHEN THAT CREATURE DIES THIS TURN" — THE DIES WATCH (CR 603.7) — Halfshell heroes 88 → 89 · **+7** · corpus 15,124 / 34,245
> Suite **1,674 files / 17,279 tests** green (1 skipped); lint 0; decks 2,699 / 2,998. CI GREEN on D24 (run 36799659291). Flip-diff **+7, zero LOST,
> zero RETIERED** (tier snapshots at 60374ca1 → the change: Together Forever, Blessed Defiance, Make Your Mark, Otherworldly Outburst, Scarblade's Malice, Felonious Rage, Grim Javelineer). **Mutants 21/21** on the final code (restore byte-identical).
> · **Build — the event-keyed delayed trigger:** delayedTrigger.js — watch-dies-this-turn records a watch on the permanent the
>   previous clause targeted (bindPreviousTargets, CR 608.2); fireDiesWatches fires it from checkDiesTriggers, the one death
>   chokepoint, when THAT permanent dies this turn — never one exiled or shuffled instead (CR 700.4), never a new object (CR
>   400.7), never a watch made after the death (CR 603.7a), never after its turn (the step drain lapses it, CR 603.7b), never
>   for a departed controller (CR 800.4a). choose-target is "Choose target creature …", the antecedent; the
>   [died-card-to-hand] sentinel finds the card in its owner's graveyard (CR 400.7e / 404.1). parser.js — the payoff must
>   parse HIGH, choose no target, and name nothing; a chosen target is admitted only directly before a referent. splitClauses
>   keeps the watch sentence whole. audit.js — a watch names the permanent it watches instead of a step.
> · **Pre-existing defect fixed:** the shared trigger-sentence scanner anchored "When that creature dies this turn" mid-line as a
>   PRINTED trigger. Together Forever and Sandals of Abdallah each carried a phantom self-dies trigger; Grim Javelineer's
>   trigger lost its delayed half. A delayed trigger never begins an ability (CR 603.7): the scanner skips it, and a trigger
>   folds it into its own effect like the reflexive "When you do". Measured: those three cards only (flip-diff).
> · **Two guards found dead by mutation:** a token check (the engine never puts a token in a graveyard, CR 111.7 — removed);
>   the referent fence survived until "create a token that's a copy of it" was found parsing HIGH alone — a fired watch has
>   no triggering creature to copy, so the fence is all that stops a native claim that creates nothing; now its witness.
> · **Runtime:** `WITNESS togetherForever {"offered":["aiBearC","bearC"],"watches":1,"died":true,"backInHand":true,"watchesAfter":0}`
>   (only creatures with a counter offered; the chosen Bear, bolted, back in its owner's hand). Each gain in play: Blessed
>   Defiance (1/1 Spirit), Otherworldly Outburst (3/2), Scarblade's Malice (2/2), Felonious Rage (2/2) — each on your Bear,
>   bolted; Make Your Mark on the OPPONENT's Bear → the 3/2 Spirit is yours (CR 603.7d); Grim Javelineer's pumped attacker
>   bolted → surveil 1. Witness `app/src/lib/learn/diesThisTurnWatch.test.js` (13).
> · **Next:** Halfshell 89 needs 1 — Tempestra (a Kiki-style copy) · Dimension X Pizzasaur (reflexive destroy over a counters
>   count) · Everything Pizza · Coin of Mastery · Vigor · Shredder, Shadow Master · then Shorikai / Teval (86).

> ## 🃏 2026-09-30 — SHELF DECKS · D24: FOOT CHOPPER — "YOU MAY SACRIFICE IT. IF YOU DO" — THE ONE-CANDIDATE SACRIFICE — Halfshell heroes 87 → 88 · **+4** · corpus 15,117 / 34,245
> Suite **1,673 files / 17,266 tests** green (1 skipped); lint 0; decks 2,698 / 2,998. CI GREEN on D23 (run 36798122388). Flip-diff **+4, zero LOST,
> zero RETIERED** (tier snapshots at 7f31c348 → the change: Foot Chopper, Impaler Shrike, Haunted Cadaver, Cacophony Scamp). **Mutants 7/7** on the final code (restore byte-identical).
> · **Build:** parser.js — matchOptionalChosenSac (shelf D13's chosen sacrifice) reads "you may sacrifice IT. If you do, …": "it" is
>   the triggering creature, and the payoff's "its power / toughness / mana value" is the sacrificed creature's (the settle's
>   last-known snapshot, CR 608.2h) · stack.js — the pause's ONE candidate is the triggering permanent while its controller still
>   controls it (CR 701.21a); gone or stolen, nothing can be sacrificed and the payoff never runs · triggerRouting.js — the trigger
>   gate admits "sacrifice it" only on the per-creature combat-damage event (a safe false negative where "it" means more) ·
>   coverage.js — the spell fence refuses it on a spell (no triggering creature). The autopilot gives up only a token.
> · **Witness tightened before commit (hollow-gate law):** the headline test claimed "the candidate is the Giant, not the Bear beside
>   it" while the board listed the Giant first — a take-the-first-permanent bug passed it (only the wearer-gone test killed that
>   mutant). The Bear now comes first; the headline witness kills it by itself.
> · **Runtime:** `WITNESS footChopper {"kind":"optional-sac-payment","candidates":["giant"],"drew":3,"giantGone":true,"bearStays":true}`;
>   declined, nothing. Each unaimed gain verified in play: Impaler Shrike (sacrificed → three cards), Haunted Cadaver (sacrificed →
>   the player it hit is asked to discard three), Cacophony Scamp (sacrificed → proliferate grows a Bear's +1/+1 counter, then its
>   own dies trigger deals its power). Witness `app/src/lib/learn/footChopper.test.js` (9).
> · **Next:** Halfshell 88 needs 2 — Together Forever · Everything Pizza · Dimension X Pizzasaur · Coin of Mastery · Vigor · Shredder,
>   Shadow Master · then Shorikai / Teval (86).

> ## 🃏 2026-09-30 — SHELF DECKS · D23: BEBOP — "DRAW X CARDS, WHERE X IS" + THE OPTIONAL-DRAW "IF YOU DO" — Halfshell heroes 86 → 87 · **+5** · corpus 15,113 / 34,245
> Suite **1,672 files / 17,257 tests** green (1 skipped); lint 0; decks 2,697 / 2,998. CI GREEN on D22 (run 36796287644). Flip-diff **+5, zero LOST,
> zero RETIERED** (tier snapshots at 8a144ce6 → the change: Bebop, Liliana's Standard Bearer, Brilliant Spectrum, Surrakar Spellblade, Barrin's Codex). **Mutants 11/11** on the final code (restore byte-identical).
> · **Build:** misc.js — "draw X cards, where X is the number of <count>" (the "draw cards equal to" count, worded with X) · parseHelpers —
>   "counters on this creature" = every counter of every kind (countForSpec's all-kinds countersOnSource) · parser.js —
>   matchOptionalDrawIfYouDo: "you may draw <X>. If you do, you lose X life" → [optional draw, reflexiveGate lose-life] binding the
>   SAME count; only a draw leads it (it always happens once chosen, CR 121.3) · triggers.js — the self-name ("counters on Bebop")
>   rewritten to the source inside this exact grammar.
> · **Two false gains caught before commit (the CREED's runtime-verify-every-gain rule):** the first build flipped FLAY ESSENCE ("You
>   gain life equal to the number of counters on it" — "it" is the exiled target, but the new count read it as the source: 0 life; an
>   existing pin in casterGainLifeRider.test.js went red) and CAMARADERIE ("You gain X life and draw X cards, where X is …" — split on
>   " and ", the gain read the spell's cost X: 0 life). Fences: the all-kinds count admits only "this creature"; splitClauses keeps one
>   X across conjuncts whole. Herald of Ilharg (correct, via "counters on it") went out with the first fence — an accepted FN.
> · **Checked, not a bug:** Barrin's Codex (and seven native cards that sacrifice themselves, then count their own counters) — the
>   engine already reads the sacrificed source's last-known counters (CR 608.2h); witnessed (three page counters → three cards).
> · **Runtime:** `WITNESS bebopTakes {"asked":"optional-effect","drew":3,"lost":3}` (two +1/+1 and a shield counter); declined, nothing.
>   Each unaimed gain verified in play: Liliana's Standard Bearer (two of your deaths, not theirs → two), Brilliant Spectrum (three
>   colours → three), Surrakar Spellblade (two charge → two), Barrin's Codex (three page → three). Witness
>   `app/src/lib/learn/bebopDrawIfYouDo.test.js` (9).
> · **Next:** Halfshell 87 needs 3 — Foot Chopper · Together Forever · Everything Pizza · Dimension X Pizzasaur · Shorikai / Teval (86).

> ## 🃏 2026-09-30 — SHELF DECKS · D22: HEROES IN A HALF SHELL (the Halfshell commander) — Halfshell heroes 85 → 86 · **+2** · corpus 15,108 / 34,245
> Suite **1,671 files / 17,248 tests** green (1 skipped); lint 0; decks 2,696 / 2,998. CI GREEN on D21 (run 36794886793). Flip-diff **+2, zero LOST,
> zero RETIERED** (tier snapshots at 18dcc58e → the change: Heroes in a Half Shell and Vulture, Feathered Fiend, both body-only → native-trigger). **Mutants 11/11** (restore byte-identical).
> · **Why:** Halfshell heroes (85, needs 5) has the shelf's densest single-line tail (9); its commander first — in every game.
> · **Build:** triggers.js — the batch combat-damage subject LIST (commas / "and/or" = a union, normalized onto the " or " list the
>   subtype batch reads) · the trigger split's event-verb test learns the plural "deal" (a subject list puts commas before the verb;
>   the split stopped inside it — the enters?/attacks? precedent) · checkBatchCombatDamageTriggers stamps each trigger with the dealers
>   ITS OWN subject names (both passes) · counters.js — "put N ±1/±1 counters on each of those creatures" (scope batchDealers) ·
>   shared.js — the scope reads them, skipping any that left (CR 400.7) · the referent gates: triggerRouting refuses it off
>   combatDamageBatch, coverage's spell fence refuses it on a spell.
> · **Runtime:** `WITNESS heroesBatch {"triggers":1,"heroes":1,"turtle":1,"bear":0,"drew":1}` · an Incurable Ogre (Mutant) alone fires it,
>   a Bear alone doesn't · `vultureBatch {"d1":1,"d2":1,"bear":0,"drew":1}` — Vulture, Feathered Fiend, the flip-diff's unaimed gain (the
>   WITH-KEYWORD batch + the same payoff) is the real carrier of the per-defender pass's stamping. Witness
>   `app/src/lib/learn/heroesInAHalfShell.test.js` (6; one synthetic spell pins the spell fence — no printed spell parses to it).
> · **Next:** Halfshell's other k=1s (Bebop's draw-X-lose-X · Foot Chopper's sac-for-power · Together Forever's dies-return · Everything
>   Pizza's five-part ability · Dimension X Pizzasaur's reflexive destroy) · Shorikai / Teval (86).

> ## 🃏 2026-09-30 — SHELF DECKS · D21: BRAGO, KING ETERNAL + THASSA + THE FLICKER TARGET POLICY — Brago Blink 88 → 90 · **+5** · corpus 15,106 / 34,245
> Suite **1,670 files / 17,242 tests** green (1 skipped); lint 0; decks 2,695 / 2,998. CI GREEN on D20 (run 36792346016). Flip-diff **+5, zero LOST,
> zero RETIERED** (tier snapshots at ca904c36 → the change: Thassa, Brago, Photon, Marshal of Zhalfir, Legion Guildmage). **Mutants 23/23** (restore byte-identical).
> · **Why:** Brago Blink (88) needed two: its commander and Thassa, whose two lines were both near misses.
> · **Build:** zones.js — Brago's "exile any number of target nonland permanents you control, then return those cards … under their
>   owner's control" (phase-out's any-number bound on the blink atom) and Thassa's "up to one OTHER target creature you control"
>   (notSource); splitClauses keeps both sentences whole · combat.js — "Tap another target creature" (notSource) · gameEngine —
>   `pickFlickerCandidate`: a lone blink's targets are ranked by what flickering gains (enters ability +3, untap +1, an opponent's
>   attachment +3, −1/−1 counters +1; +1/+1 counters, your own attachments and an attached Equipment weigh against; a token never).
>   "Up to" / "any number" flicker only what gains; a mandatory target (Conjurer's Closet) takes the best on offer; "any number"
>   builds the gaining subset from the full legal set (the 64-option enumeration keeps only the largest subsets).
> · **Behaviour change (existing native cards):** the chooser took the first correct-side candidate and the expander orders subsets
>   maximal-first — Displacer Kitten / Teleportation Circle flickered whatever came first, and Brago would have flickered every
>   permanent, tokens included. They now flicker what gains (witnessed on the Circle). Worth Omnath's eye: trajectories will differ.
> · **Found and fenced (chip task_149886ba):** a flickered or reanimated AURA returns attached to nothing and stays (CR 303.4f / 704.5m
>   not implemented for non-cast entries) — Displacer Kitten could already do this. Kitten and Brago no longer offer Auras (an
>   under-offer) until a returned Aura can choose its host; the chip lists the exclusions to lift.
> · **Runtime:** `WITNESS bragoFlicker {"targets":["Brago, King Eternal","Elvish Visionary","Grizzly Bears","Hill Giant"],"drew":1,"tokenKept":true,
>   "plainKept":true,"bragoUntapped":true,"pacifismHolds":false}`. Witness `app/src/lib/learn/flickerTargets.test.js` (11) — every board built so
>   the factor under test decides its outcome (the first draft had five that couldn't; caught in review before the mutation run).
> · **Mutation:** 23/24 — the survivor (a largest-candidate search) was already the first candidate under the expander's maximal-first
>   sort; it became safe[0], and that is what corrected the account of the old behaviour above. The 23 re-killed on the final code.
> · **Unaimed gains, verified in play:** Photon, Lady of Light (her attack flicker), Marshal of Zhalfir and Legion Guildmage ("tap
>   another target creature") — the same two arms; each witnessed (Photon flickers the Visionary, never herself; neither taps itself).
> · **Next:** Shorikai / Teval (86 — each needs 4) · Kellan / Halfshell (85) · the Aura chip unlocks Brago's Aura re-aims.

> ## 🃏 2026-09-30 — SHELF DECKS · D20: ELESH NORN'S ENTERS SILENCE + THE BATCHED LEAVES EVENT — Brago Blink 86 → 88 · **+3** · corpus 15,101 / 34,245
> Suite **1,669 files / 17,231 tests** green (1 skipped); lint 0; decks 2,693 / 2,998. CI GREEN on D19 (run 36790490021). Flip-diff **+3, zero LOST,
> zero RETIERED** (tier snapshots at d858a3f0 → the change: Elesh Norn body-only → native-static, Dour Port-Mage and Sally Sparrow body-only → native-mixed). **Mutants 18/18** (restore byte-identical).
> · **Why:** Brago Blink (86) needs four; its single-line blockers with machinery to extend were Elesh Norn (Torpor Orb's reader)
>   and Dour Port-Mage (the diesBatch shape). Brago, King Eternal (the commander's any-number flicker) is the next slice.
> · **Build — Elesh Norn:** "Permanents entering don't cause abilities of permanents your opponents control to trigger" — one
>   textNormalize reader (a live scan, one per enters event: the landfall path runs on every land drop) + a classifier marker;
>   the three enters dispatchers share one `entersWatchersOf` rule: while an opponent's carrier is out, only a player's emblems
>   (not permanents) are reached. Any permanent entering counts; her own entrance counts (CR 603.10). Her first line (your enters
>   triggers trigger twice) was already modeled.
> · **Build — batched leaves:** "whenever one or more [other] creatures you control leave the battlefield [without dying]" —
>   singularized onto the singular leaves arm (so only its subjects are admitted), rewritten to `permanentLeavesBatch`, fired ONCE
>   per watcher per batch by its own pass (CR 603.2c); "without dying" skips graveyard exits (CR 700.4). The leavers are sources
>   too (CR 603.10a — Evacuation bouncing Port-Mage with the others still draws one).
> · **Caught before commit (CR 400.7):** a flickered card returns as a NEW permanent id, so the returned Port-Mage also "saw" the
>   leave it wasn't there for — Ghostly Flicker on Port-Mage + a Bear drew two. A battlefield watcher whose card left in the batch
>   is now skipped (its look-back is its one source); the witness pins one draw. Two dead guards were removed before the mutation run.
> · **Runtime:** `WITNESS nornEnters {"theirs":0,"yours":2}` · `nornLandfall {"lynxPumped":false,"emblemAsked":true,"emblemDrew":1}` ·
>   `portMageBatch {"drawn":1,"portMageInHand":true}` · `portMageFlicker {"drawn":1}`. Witnesses
>   `app/src/lib/learn/eleshNornMotherOfMachines.test.js` (7) · `leavesBatch.test.js` (6).
> · **Next:** Brago, King Eternal (Brago Blink's last big one) · Shorikai / Teval (each needs 4).

> ## 🃏 2026-09-30 — SHELF DECKS · D19: A REMOVE-A-COUNTER PAYMENT + THE CHOSEN-TYPE TRIGGER DOUBLER — Believe it! 88 → 90 · **+2** · corpus 15,098 / 34,245
> Suite **1,667 files / 17,218 tests** green (1 skipped); lint 0; decks 2,691 / 2,998. CI GREEN on D18 (run 36788596908). Flip-diff **+2, zero LOST,
> zero RETIERED** (tier snapshots at e24cbe61 → the change: Roaming Throne body-only → native-static, Ingenious Prodigy body-only → native-trigger). **Mutants 19/19** (restore byte-identical).
> · **Why:** Believe it! (88) needed two; after D18 every remaining single-line blocker on the shelf is a one-off, so the pick is
>   the two whose machinery already existed: the optional-payment lane and the source-scoped trigger multiplier.
> · **Build — Ingenious Prodigy:** interveningIf's source-counter threshold reads the P/T spellings ("+1/+1" / "-1/-1" are the map
>   keys) · a `remove-counter` cost kind on the optional-mana-payment lane ("you may remove <N> <kind> counter(s) from it / this
>   <noun>. If you do, <payoff>"): the counters come off the SOURCE all-or-nothing, the payoff runs only when they did, the AI
>   pays if able through the same predicate the settle uses, the panel names the counter. Time / fade / loyalty stay refused.
>   "it" = the source on every corpus carrier (13 cards censused; all five "from it" forms are self-subject triggers).
> · **Build — Roaming Throne:** the multiplier family reads "it triggers an additional time" and a subject term off the static's
>   own permanent — the creature type it chose as it entered (perm.chosenType), layer-aware, changelings included (CR 702.73a);
>   "another" keeps the Throne's own abilities out though it is that type too.
> · **Payment carriers that parse now but stay parked (another line blocks):** Sun Droplet and Living Artifact ("whenever you're
>   dealt damage, put that many … counters"), Nazar ("whenever you gain life, put a feeding counter"), Purestrain Genestealer.
> · **Runtime:** `WITNESS prodigyPays {"counters":1,"hand":1}` (after paying off 2) · `nazarAllOrNothing` short (2 of 3 feeding):
>   no pick, nothing removed, no draw; full: 0 left, drew 3, life 37 · `roamingThrone {"visionary":2,"omens":1,"cohortTokens":2}`.
>   Witnesses `app/src/lib/learn/ingeniousProdigy.test.js` (7) · `roamingThrone.test.js` (5) · the label in `PendingChoicePanels.test.jsx`.
> · **Next:** the 86s (Teval, Brago, Shorikai — each needs 4) · We Say Thee Nay! · the choose-two bite template.

> ## 🃏 2026-09-30 — SHELF DECKS · D18: VEIL OF SUMMER (can't-be-countered this turn · hexproof from colours) — Kinnan 89 → 90, Killer Turts 89 → 90 · **+1** · corpus 15,096 / 34,245
> Suite **1,665 files / 17,204 tests** green (1 skipped); lint 0; decks 2,689 / 2,998. CI GREEN on D17 (run 36785819963). Flip-diff **+1, zero LOST,
> zero RETIERED** (tier snapshots at a4486716 → the change). **Mutants 28/28** (restore byte-identical).
> · **Why:** Veil of Summer sits in Kinnan and Killer Turts, both one card short of 90. Its three sentences reuse D17's colour
>   ledger and two seams that already existed (the uncounterable predicate, the target-shield layer op).
> · **Build:** interveningIf — "an opponent has cast a blue or black spell this turn" ("has", and either of two colours) · stack.js —
>   "spells you control can't be countered this turn" = a turn stamp on the controller, read by stackSpellIsUncounterable (spells
>   on the stack now and cast later) · "you and permanents you control gain hexproof from <c> [and from <c>] until end of turn" = a
>   turn-stamped player record (playerTargetableBy) + an end-of-turn layer-6 targetShield{colors} on the permanents it controls as it
>   resolves (CR 611.2c) · splitClauses keeps the hexproof sentence whole · enumerateTargets threads the source's colours to players.
> · **Caught before commit (CR 109.5 / 702.11d):** the first build named Veil's caster as the shield's "you" (the Canopy Cover
>   pattern). Hexproof from X is a keyword on the permanent — its opponents are the permanent's CURRENT controller's — so a Giant
>   stolen after Veil must refuse its old controller's blue spells. Witnessed with Act of Treason; the pre-fix code is mutant V12.
> · **Fail-closed paths:** triggers and activated abilities thread no source colours, so the shield refuses them outright (an
>   under-offer, CREED-safe): their Man-o'-War can't take the Giant; their Ravenous Rats' trigger has no target (CR 603.3d).
>   The Enchant-player Aura offer likewise passes none — Fraying Sanity (blue, the only native player-Aura) is refused either way,
>   so threading the Aura's colours changed nothing observable and was dropped as dead code.
> · **Found, pre-existing (banked):** Man-o'-War alone never bounces itself — a mandatory ETB whose only legal target is its own
>   source is skipped silently (no trigger, no log), with or without Veil, either seat.
> · **Runtime:** `WITNESS veilShields {"unsummon":[],"mindRot":["ai"],"bolt":["ai","giant","user"],"frayingSanity":["ai"]}` ·
>   `veilStolen {"stolen":true,"yours":[],"theirs":["giant"]}` · `veilUncounterable {"onStack":0,"castLater":0,"nextTurn":1}`.
>   Witness `app/src/lib/learn/veilOfSummer.test.js` (8).
> · **Next:** Believe it! (88) · the 86s (Teval, Brago, Shorikai) · We Say Thee Nay! · the choose-two bite template.

> ## 🃏 2026-09-30 — SHELF DECKS · D17: THE TRAP CYCLE (through the shared condition reader) — Kinnan 88 → 89, Killer Turts 88 → 89, Believe it! 87 → 88 · **the shelf crosses 90%** · **+9** · corpus 15,095 / 34,245
> Suite **1,664 files / 17,195 tests** green (1 skipped); lint 0; decks 2,685 / 2,998. CI GREEN on D16 (run 36783162820). Flip-diff **+9, zero LOST,
> zero RETIERED** (tier snapshots at 706f70d1 → the change). **Mutants 20/20 killed on assertions** (restore byte-identical).
> · **Why:** 19 Traps print "If <condition>, you may pay <cost> rather than pay this spell's mana cost"; 13 already had HIGH bodies and
>   were held out only by their conditions — the opponent twins interveningIf's own header had DEFERRED. The shared reader is the
>   mechanism (one gate for metric + runtime), which also lays the ground for the banked conditional self-cost reducer (119 cards).
> · **Build:** interveningIf — opponent cast a <color> spell / N+ spells, drew N+ cards, gained life, had N+ cards hit the graveyard
>   (cards only); N+ / exactly one creature attacking, a <color> creature [with flying] attacking (attackers still on the battlefield) ·
>   recordSpellCast records colors (the dispatcher threads colorsOf) · the conditional fixed-mana alt cost (one textNormalize regex; the
>   strip gated by spellConditionParseable, the offer by evaluateInterveningIf; {0}/{1}{G} pips; ability-word label read through) ·
>   Mindbreak's "exile any number of target spells" (the Venser stack move → exile; not a counter).
> · **Unaimed gain, verified:** Admiral's Order ("Raid — If you attacked this turn, you may pay {U} …") — the classifier stripped the
>   label, the runtime reader didn't, so the {U} would never have been offered: the reader now strips it too (witnessed).
> · **Parked with reasons:** Refraction (red instant/sorcery), Cobra (destruction attribution), Inferno (damage sources), Archive (no
>   search ledger), Baloth Cage / Whiplash / Permafrost (an entry turn can't tell whose control it entered under — an FP trap).
> · **Runtime:** `WITNESS ricochetTrap {"offeredOnRed":0,"offeredOnBlue":1,"cost":1,"giantHome":true,"bearBounced":true}` ·
>   `mindbreakTrap {"afterOne":0,"cost":0,"rendExiled":true,"giantAlive":true}`. Witness `app/src/lib/learn/traps.test.js` (11).
> · **Next:** Veil of Summer (Kinnan + Killer Turts → both 90; reuses the color ledger) · We Say Thee Nay! · the choose-two bite template.

> ## 🃏 2026-09-30 — SHELF DECKS · D16: TEAMWORK — **Wolverine 89 → 90** (HULK SMASH!) · **+7** · corpus 15,086 / 34,245
> Suite **1,663 files / 17,184 tests** green (1 skipped); lint 0; decks 2,681 / 2,998. CI GREEN on D15 (run 36780691171). Flip-diff **+7, zero LOST,
> zero RETIERED** (tier snapshots at eaa3d07e → the change). **Mutants 21/21 killed on assertions** (restore byte-identical).
> · **What:** Teamwork N = kicker paid by tapping creatures with total power ≥ N (the printed reminder is the definition — the keyword
>   postdates the bundled CR; no rule number cited). "If this spell was cast using teamwork" reads as "kicked" inside the kicked-spell
>   matcher; "Choose one. If … cast using teamwork, choose both instead." = a modal flagged `conditionalBothKicked` (teamwork cast = BOTH).
> · **Cost path:** the kicked variant carries its tap set — crew's policy (sick first, then smallest) + a PRUNE pass (crew's greedy fill
>   over-taps: 1+2 against N=2) — offered only if the mana is payable WITHOUT those creatures (castPaymentSources, the emerge guard);
>   the dispatcher re-checks live + taps (real becomes-tapped events); short/stale/missing/doubled → throws. AI: teamwork only when the
>   tapped set is all summoning-sick. actionLabel names kicked/teamwork variants.
> · **Found in passing (queued as a chip):** the Academy's primary cast flow picks the FIRST option matching a clicked target, and the
>   fallback labels didn't name variants — a human could not reliably choose a kicked / teamwork / X / other-mode cast. Also noted: the
>   kicker cast's `cmc` cites "CR 202.3b" for counting kicker mana — mana value is the mana COST (202.3); the field only feeds AI ranking.
> · **Runtime:** `WITNESS hulkOffer {"plainModes":["[0]","[1]"],"teamModes":["[0,1]"],"teamTaps":["bear,giant"]}` · `hulkTeamwork
>   {"tappedAtCast":{"giant":true,"bear":true},"ringGone":true,"theirBearDead":true}`. Witnesses `app/src/lib/learn/teamwork.test.js` (13),
>   `app/src/components/mtg/castVariantLabel.test.jsx` (1).
> · **Next:** We Say Thee Nay!'s trailing "instead if" (Captain America) · the choose-two bite template (8 cards) · Believe it! · the 86s.

> ## 🃏 2026-09-30 — SHELF DECKS · D15: Wolverine, Claws Out — **Wolverine 88 → 89** · +1 / −1 (an over-fire closed) · corpus 15,079 / 34,245
> Suite **1,661 files / 17,170 tests** green (1 skipped); lint 0; decks 2,680 / 2,998. CI GREEN on D14 (run 36778635313). Flip-diff **+1 (Wolverine, Claws Out),
> −1 (Thrashing Frontliner — understood: the over-fire below), zero RETIERED** (tier snapshots at db658eca → the change). **Mutants 8/8** (restore byte-identical).
> · **Build:** the Thorn reader + classifier credit take gendered self-pronouns ("assign HIS combat damage as though HE weren't blocked" —
>   the connive precedent) · a non-self attack watcher's "double its power" → the triggering-creature sentinel → pump target:"thatCreature",
>   doublePt:"p" (CR 608.2c + 701.10). The self "double its power" form and the "and toughness" twin were trimmed — no modeled carrier.
> · **⚠️ SHIPPED OVER-FIRE CLOSED:** "Whenever this creature attacks a battle, …" hit the classifier's self-attack arm (it keys on ANY
>   "this"), dropping the battle tail → Thrashing Frontliner's +1/+1 fired on every swing at a player. The engine has no battle to attack
>   (declare-attackers offers players + planeswalkers), so the clause PARKS. Found by runtime-checking War-Trained Slasher's gain (the
>   3rd instance of reference_blocker_credit_unmasks_fps — runtime-verify EVERY gained card). The "a player" tail stays as it was: its three
>   native carriers (the Backgrounds) are guarded by their intervening-if's planeswalker FN-drop (SC-1).
> · **Runtime:** `WITNESS wolverineDoubles {"triggers":2,"wolverine":[4,5],"mutant":6,"bear":2}` · blocked by a 0/9 Wall: 4 to the player,
>   0 to the Wall · `frontlinerNoOverfire {"tier":"body-only","triggers":0,"power":2,"toughness":2}`. Witness `app/src/lib/learn/wolverineClawsOut.test.js` (5).
> · **Next:** Teamwork (17 cards — HULK SMASH! for Wolverine's 90, We Say Thee Nay! for Captain America) · the choose-two bite template (8).

> ## 🃏 2026-09-30 — SHELF DECKS · D14: CHANGE THE TARGET (CR 115.7a) — Kinnan 87 → 88, Believe it! 86 → 87, Killer Turts 85 → 88 · **+7** · corpus 15,079 / 34,245
> Suite **1,660 files / 17,165 tests** green (1 skipped); lint 0; decks 2,679 / 2,998. CI GREEN on D13 (run 36773209495). Flip-diff **+7, zero LOST,
> zero RETIERED** (tier snapshots at 4735df65 → the change). **Mutants 40/42 killed on assertions; the 2 survivors were dead and are removed** (restore byte-identical).
> · **Why:** the three pod-sim decks (Killer Turts, Kinnan, Believe it!) carry five redirect spells the engine refused: "Change the target
>   of target spell [or ability] with a single target" — mandatory (115.7a), unlike Deflecting Swat's optional "choose new targets" (115.7d).
> · **Build:** `change-target` atom (spell form = single-target + not-a-counter; "or ability" form — the single-target filter now reaches
>   abilities too) · `changeTargetAlternatives` (targeting.js: the object's side, slot, kick and mode — 115.8; never the current target,
>   never itself — 115.5) · none → stays, logged · one → moves · several → a NEW `change-target` pause: ChangeTargetPanel (no decline),
>   pilot one-action-per-candidate, autopilot by the redirected slot's intent (harm → not ours; help → ours); the settle takes only an
>   OFFERED candidate that is STILL legal · AI arm: cast only at an opponent's harmful single-target object aimed at its stuff that can go
>   to an opponent's side, costliest first · Untimely Malfunction's "one or two target creatures can't block" · seatLabels.js leaf.
> · **⚠️ LATENT FP CLOSED (CR 115.5):** Deflecting Swat re-enumerated a spell's targets with the spell still on the stack, so a Counterspell
>   aimed at your spell could be deflected onto ITSELF. Now declines (`swatNeverItself`).
> · **Honest limits:** Bolt Bend pays full price (its "{3} less if you control a creature with power 4 or greater" is the documented
>   unmodeled-self-reduction policy — castModifiers.stripSelfCostReduction). Ricochet Trap parked on its blue-spell trap cost. The AI holds
>   the modal Untimely Malfunction (generic hold). FOLLOW-UP QUEUED: 119 corpus cards print "costs {N} less to cast if <condition>" —
>   70 already native at full price; a shared-condition reducer (interveningIf) would make them correct.
> · **Runtime:** `WITNESS misdirectionChoice {"offered":["ai","bear","user"],"moved":["bear"],"bearDead":true,"giantAlive":true}` ·
>   `counterspellNeverItself {"withBolt":→Lightning Bolt, "alone":no-other-legal-target}` · `aiRedirects {"card":"Misdirection","target":"Lightning Bolt"}`.
>   Witnesses `app/src/lib/learn/changeTarget.test.js` (27), `app/src/components/mtg/changeTargetPanel.test.jsx` (3).
> · **Next:** Wolverine 88 (power-doubling cluster / Multiversal Passage) · Believe it! · the 86s.

> ## 🃏 2026-09-30 — SHELF DECKS · D13: the reflexive CHOSEN sacrifice — **Captain America 89 → 90** (Iron Man) · **+3** · corpus 15,072 / 34,245
> Suite **1,658 files / 17,134 tests** green (1 skipped); lint 0; decks 2,674 / 2,998. CI GREEN on D12 (run 36770424179). Flip-diff **+3, zero LOST,
> zero RETIERED** (tier snapshots at f3b5fc96 → the change). **Mutants 18/19 killed on assertions; the survivor removed** (restore byte-identical).
> · **First-run red (planted, graduated):** D12's podTutor pin asserted Iron Man waits for D13 — it now reads native-trigger; re-run 23/23.
> · **Why:** Iron Man's "…then you may sacrifice a noncreature artifact. If you do, search … 1 plus the sacrificed artifact's mana
>   value …" — which artifact is the PLAYER's choice (CR 603.7c) and sets the fetched value; the value-token lane auto-picks.
> · **Build (full stack):** parser `matchOptionalChosenSac` ("[<lead>, then] you may sacrifice <an artifact phrase>. If you do, …";
>   vocabulary = the artifact forms only — "a creature" / "another creature" (28 cards) wait for a pilot policy that can weigh a body)
>   · the pause lists candidates (current types) · the settle sacrifices the NAMED one (unnamed / non-candidate → nothing) and hands
>   its LKI to the payoff (ctx.sacrificedForCost — D12's channel) · auto-pick = a token only · the pilot is offered one action per
>   candidate + decline · the human's { sac, victimId } → settler, logged · OptionalSacPanel lists candidates (+ "an artifact") ·
>   useLearnSession posts the id via the pure `optionalSacChoicePayload`.
> · **Mutation note:** the "Otherwise" half of the payoff guard SURVIVED — a payoff with an else-branch never parses HIGH, so the
>   half was dead; removed. The second-"if you do" half is load-bearing (killed).
> · **Runtime:** `WITNESS ironManChoice {"kind":"optional-sac-payment","candidates":["Mind Stone","Sol Ring","Treasure"],"treasureIsToken":true}`
>   · Sol Ring → Fellwar Stone (tapped) · the Treasure → Wayfarer's Bauble · decline / unnamed / non-candidate → nothing · pilot
>   offered [ring, tr, false] and its pick goes · AI keeps Sol Ring · Ironclad Revolutionary counters + drain · the panel + the
>   hook payload. Witnesses `app/src/lib/learn/chosenReflexiveSac.test.js` (11), `app/src/components/mtg/optionalSacChosenPanel.test.jsx` (4).
> · **Next:** Wolverine 88 · Kinnan 87 · the 86s.

> ## 🃏 2026-09-30 — SHELF DECKS · D12: the Pod tutor — Birthing Pod, Vannifar, Oswald, Repurposing Bay · **+4** (no deck slot: the prerequisite for Iron Man) · corpus 15,069 (44.0%) / 34,245
> Suite **1656 files / 17,119 tests** green (1 skipped); lint 0; decks 2,673 / 2,998 (unchanged). CI GREEN on D11 (run 36768762249). Flip-diff **+4, zero
> LOST, zero RETIERED** (tier snapshots at b5570285 → the change). **Mutants 7/7 killed on assertions** (restore byte-identical).
> · **Why a slice with no deck move:** Captain America's closest slot is Iron Man, whose line is a reflexive "you may sacrifice a
>   noncreature artifact. If you do, search … mana value equal to 1 plus the sacrificed artifact's …". The tutor half is the Pod
>   family's (20 corpus cards blocked by a "1 plus" line); the reflexive sacrifice is a real CHOICE (which artifact sets the value)
>   the existing value-token lane auto-picks — so it is D13, with the choice honoured.
> · **Build:** library.js bfp arm → filter.mvFromSacrificedPlus, resolved in applyTutor to an EXACT mana value from the sacrificed
>   permanent's LKI (CR 608.2h); no value → nothing matches. ⚠️ **The sacrificed LKI is now frozen on the ability**
>   (params.context.sacrificedForCost): the shared state channel was overwritten by any sacrifice-cost ability activated in
>   response, so the first ability resolved with the second's numbers — Altar of Dementia's mill included.
> · **Runtime:** `WITNESS birthingPod {"candidates":["Centaur Courser"],"fetched":true,"bearGone":true}` · Vannifar never sacrifices
>   itself · Oswald / Bay: Sol Ring → Mind Stone · `WITNESS podFrozenSacrifice {"shared":4,"candidates":["Centaur Courser"],"milled":3}`
>   · two stacked Altars mill 3 then 2 · Iron Man's tapped clause · no value → no fetch. Witness `app/src/lib/learn/podTutor.test.js` (8).
> · **Next:** D13 — Iron Man's reflexive, CHOSEN sacrifice (Captain America 89 → 90).

> ## 🃏 2026-09-30 — SHELF DECKS · D11: five more damage-doubler scopes (CR 614) — **Captain America 88 → 89 · Halfshell 84 → 85** · **+5** · corpus 15,065 (44.0%) / 34,245
> Suite **1655 files / 17,111 tests** green (1 skipped); lint 0; decks 2,670 → **2,673** / 2,998. CI GREEN on D10 (run 36765780624). Flip-diff **+5,
> zero LOST, zero RETIERED** (tier snapshots at ae5c227f → the change). **Mutants 19/19 killed on assertions** (restore byte-identical).
> · **Why:** the residue map's rows for Halfshell (Raphael, k=1) and Captain America (Mjölnir, k=2) were doublers; a census found
>   40 non-native doubler cards, the doubling line the SOLE blocker on 16.
> · **Build:** damageReplacements.js — any-counter creatures you control (Raphael), creature sources you control (Absorbing Man
>   and Titania), a <Subtype> source you control (Calamity Bearer), damage to an opponent (Fiendish Duo), the equipped creature
>   (Mjölnir, read live off the Equipment). coverage: COMPOSE — a doubler beside fully-modeled text reads native-mixed (the Regal
>   Behemoth pattern); a strip that fails to clear the doubler refuses rather than recurse. Mjölnir's "Equip worthy" = its
>   reminder's definition (legendary non-Villain, red and/or white), parsed only beside that exact definition.
> · ⚠️ **SHIPPED FP CLOSED — Goblin Goliath:** its ACTIVATED "{3}{R}, {T}: If a source you control would deal damage to an
>   opponent this turn, it deals double…" was read as a STATIC (the parser scanned the whole oracle) — every source its
>   controller controls dealt double from the moment it entered, activated or not. Found because composition credited the card
>   native on the first flip-diff. Doublers now parse from static lines only; Goliath is the only corpus card the filter changes.
> · **Pin re-pointed:** damageReplacements.test.js's residue guard held a MODELED dies trigger (parked only by the blanket
>   no-trigger refusal) — now a genuinely unmodeled trigger; the old one is the composition graduation.
> · **Left out on purpose:** The Sound of Drums (the enchanted-creature form) — an Aura's tier gates its own cast lane
>   (grantAuraCastHostType), so crediting it through the generic compose would read native and never be castable.
> · **Runtime:** `WITNESS raphael {"oilCounter":4,"plusCounter":6,"noCounter":2}` · Absorbing Man doubles creature combat, not an
>   artifact's ability · Calamity Bearer: Giant 6, Bear 2 · Fiendish Duo: opponent 4, you 3, a creature 1 · Mjölnir: equipped 4
>   + other 2, unattached 2 · Equip worthy offered to the red and white legends only (not a green legend, a red Villain, a red
>   non-legend) · `WITNESS goliath {"parsed":[],"loss":2}` · synthetic pins: a trigger-effect doubler, a foreign "worthy".
>   Witness `app/src/lib/learn/damageDoublerScopes.test.js` (10).
> · **Next:** Captain America (Uthros = station — parked: the land tier already credits its 12+ mana line with no counters, so
>   station needs the N+ gates enforced first) · Wolverine 88 · Kinnan 87.

> ## 🃏 2026-09-30 — SHELF DECKS · D10: change a spell's target to this creature (CR 115.7a) — **Captain America 87 → 88 · Kinnan 86 → 87 · Believe it! 85 → 86** · **+1 card, 4 slots** (also Test Rashmi, above the bar) · corpus 15,060 (44.0%) / 34,245
> Suite **1654 files / 17,100 tests** green (1 skipped); lint 0; decks 2,666 → **2,670** / 2,998. CI GREEN on D9 (run 36763785097). Flip-diff **+1,
> zero LOST, zero RETIERED** (tier snapshots at 4a1f0836 → the change). **Mutants 15/15 killed on assertions** (restore byte-identical).
> · **Why:** the residue map, regenerated after D9 (12 decks under the bar, 185 blocked slots, 65 needed), ranked Hydroelectric
>   Specimen's ETB first — one line, three decks (Gemstone Caverns tied it and stays parked: a pre-game seam).
> · **Build:** `redirect-to-source` (atoms/stack) — targets an instant or sorcery with exactly one chosen target (CR 115.9a);
>   `notCounter` (changing a target is not countering) + a new `singleTargetOnly` threaded through the spell spec and enforced
>   in the stack enumerator. `applyRedirectToSource`: moves the target only when the source is a legal target for the SAME
>   slot, from the spell controller's side, with the spell's kick and mode (CR 115.8); else unchanged, reason logged
>   (CR 115.7a). Intent "enemy".
> · **Found while witnessing:** a single-atom spell cast through the legacy path records no atomIndex on its target — the
>   first slot check refused to move Lightning Bolt. Fixed (the slot is compared only when recorded).
> · **Runtime:** `WITNESS specimenRedirect` — flashed in against the AI's Bolt at your Hill Giant: the Specimen takes 3 and
>   lives, the Giant lives, and targeting the AI's spell is a crime · a kicked Burst Lightning moves in slot 1 · an
>   uncounterable Bolt still redirects · Shatter stays on the Sol Ring · Abrade's artifact mode stays, creature mode moves ·
>   a two-slot spell moves in its own slot (synthetic shape, labeled) · Specimen gone → unchanged · Prey Upon (two targets)
>   and Pacifism (an Aura) never offered · a program-less spell logged, no throw. Witness
>   `app/src/lib/learn/redirectToSource.test.js` (11).
> · **Next:** Wolverine 88 · Captain America 88 · Kinnan 87 — the residue map's next rows.

> ## 🃏 2026-09-30 — SHELF DECKS · D9: committing a crime (CR 700.13) — **Otharri 89 → 90** · **+13** · corpus 15,059 (44.0%) / 34,245
> Suite **1653 files / 17,089 tests** green (1 skipped); lint 0; decks 2,665 → **2,666** / 2,998. CI GREEN on D8 (run 36761118885). Flip-diff **+13,
> zero LOST, zero RETIERED** (tier snapshots at 8f96e01d → the change). **Mutants 20/20 killed on assertions** (restore byte-identical).
> · **Why crime:** Otharri's cheapest line was Patrolling Peacemaker's "Whenever an opponent commits a crime"; the census found 29
>   crime cards, the crime line the SOLE blocker on 18 — a mechanic, not a card.
> · **Build:** `triggers.checkCrimeTriggers` at the four target-choice sites checkBecomesTargetTriggers already had (cast,
>   activation, loyalty — actionDispatcher; a trigger reaching the stack — the flush), which are exactly CR 700.13's three
>   moments. Side of a target: a player itself; a permanent its controller now; a spell/ability its stack object's
>   controller; a graveyard card its holder. `crimeCommittedThisTurn` (cleared at untap, written only when set); watchers
>   "you commit a crime" / "…during your turn" (above the blanket during-reject) / "an opponent commits a crime"; the
>   static gate "as long as you've committed a crime this turn" and the intervening-if "if you've …".
> · **Runtime:** `WITNESS crimeByTarget` — their creature / their face = crime (Raven drains), your creature / yourself =
>   none · Cremate at their graveyard = crime, yours = none · Cancel on their spell = crime, yours = none · Blood Hustler's
>   activated drain = crime, its own watcher adds ONE counter across two activations · Ob Nixilis −3 = crime ·
>   `WITNESS crimeByTrigger` Chupacabra's ETB = crime, the opponent's Peacemaker proliferates 2 → 3 · whose gates both
>   ways · Overzealous Muscle only on its controller's turn · Vault-Buster 1/4 → 3/4 → 1/4 at the next untap. Witness
>   `app/src/lib/learn/crime.test.js` (12). A first fixture of mine let Chupacabra's ETB pick the Peacemaker itself —
>   fixed the board order, not the engine. Pin re-pointed: triggerScopesR2's TR-3 "crime PARK" ("no crime marker
>   exists") now pins the detected watcher — a graduation.
> · **Parked with reasons:** Servant of the Stinger (the "you may sacrifice … If you do, search" payoff), Take for a Ride
>   ("has flash as long as …" — no conditional-flash model), Kaervek / Lazav / Forsaken Miner (copy-and-cast, a
>   graveyard exile choice, a graveyard-functioning watcher), Rattleback Apothecary ("your choice of menace or lifelink").
> · **Next:** Wolverine 88 · Captain America 87 · Otharri's remaining tail.

> ## 🃏 2026-09-30 — SHELF DECKS · D8: a kicked spell's targets depend on the kick — **Shalai 89 → 90** · Otharri 87 → 89 · Light-Paws 82 → 83 · **+9** · corpus 15,046 (43.9%) / 34,245
> Suite **1652 files / 17,077 tests** green (1 skipped); lint 0; decks 2,661 → **2,665** / 2,998. CI GREEN on D7 (run 36757020205). Flip-diff **+9,
> zero LOST, zero RETIERED** (tier snapshots at 9e633df8 → the change). **Mutants 20/20 killed on assertions** (restore byte-identical).
> · **Why:** Galadriel's Dismissal (×3 decks) swaps its TARGET when kicked — a creature unkicked, a player kicked — and the
>   cast enumerator offered one target set for both casts. A census of kicker spells whose kicked clause carries its own
>   target found 14 corpus cards, 4 shelf slots (Galadriel's ×3, Divine Resilience) — a first count of 5 read Veyran's "Gitaxian Probe" as Probe.
> · **Build:** `targeting.expandAtoms` reads `ctx.kicked` — an atom that won't run in the cast being offered takes no target
>   (CR 601.2c "alternative targets", CR 702.33g). Default = unkicked, the same default runEffectProgram resolves with.
>   legalChoices enumerates the two casts separately (interleaved, so additive kickers keep their exact offer order);
>   Deflecting Swat's retarget passes the spell's own kick. Parser: `matchKickedWholeReplacement` — "<one sentence>. If
>   kicked, instead <a complete clause>" → base `nonKickedOnly` + the clause's own atoms `kickedOnly`; guards: one-sentence
>   base, no back-reference (it/its/that/those/another/chosen), clause HIGH. Gate 4 (kicked-only target) GRADUATED;
>   "another target" still refuses (no cross-atom distinctness). Phase-out: "each creature target player controls phases
>   out" (Contagion Engine's `eachCreatureOfTargetPlayer` expansion). The counted-subject peel agrees the verb across
>   "you control" (Divine Resilience's kicked clause).
> · ⚠️ **A SHIPPED FP CLOSED — Burst Lightning's magnitude pair:** both atoms carried their own target, so every cast was a
>   cartesian of two independent picks (50 casts where 10 are real). The unused pick still TARGETED: a Phantasmal Bear
>   was sacrificed by a Burst Lightning aimed at a player; the AI chose its kicked cast by the first pick while the 4
>   damage went to the second (its own creature, in enumeration order). Seven shipped cards had it (census): Burst
>   Lightning, Shivan Fire, Roil Eruption, Firebending Lesson, Might of Murasa, Explosive Growth, Gift of Growth.
> · **Runtime:** `WITNESS burstLightningCasts` 10 casts, one target each (atom 0 unkicked, atom 1 kicked) · Phantasmal Bear
>   lives (control: aimed at it, it's sacrificed) · the AI's kicked cast kills the enemy Bear, its own lives ·
>   `WITNESS galadrielsDismissalKicked {"theirsOut":["a1","a2"],"theirBoard":[],"mine":["u1"],"back":["a1","a2"]}` · no
>   creature → only the kicked cast · Deflecting Swat re-aims a kicked Dismissal at the other PLAYER · Bloodchief's Thirst /
>   Tear Asunder / Highly Illogical offer each half only its own targets · Divine Resilience's two creatures survive a real
>   wrath · Field Research 2 or 3 (never 5) · Wild Onslaught 1 or 2 counters · Bold Defense +1/+1 or +2/+2 first strike ·
>   Probe's kicked target discards two. Witness `app/src/lib/learn/kickedTargetVariants.test.js` (19).
> · **Pins re-pointed (5, all graduations):** Field Research (×2 files — the marker MOVED to a two-sentence base, as it
>   asked); the kicked-only target; Galadriel's parked pin (D7); and "Fake Kicker" — its tail had parsed HIGH for a while,
>   it was held by the Gate-4 refusal, not the unmodeled tail it claimed. Now pins a genuinely LOW tail.
> · **Dropped before commit (unwitnessed):** the storm-copy kick thread (no storm spell has kicker), and in the matcher a
>   double-"instead" guard, a structural referent guard and an additional-cost guard (parseEffectClause never sets one);
>   in the peel, "an opponent controls" and the qualifier-plus-"each" form (no card needed them — flip-diff unchanged).
> · **Next:** Otharri 89 (Patrolling Peacemaker — CRIME: 29 corpus cards, the crime line is the SOLE blocker on 18) · Wolverine 88 · Captain America 87.

> ## 🃏 2026-09-30 — SHELF DECKS · D7: targeted phasing — Clever Concealment (**Shalai 88 → 89**, **Otharri 86 → 87**) · **+3** · corpus 15,037 (43.9%) / 34,245
> Suite **1651 files / 17,058 tests** green (1 skipped); lint 0; decks 89% (2,659 → **2,661** / 2,998). CI GREEN on D6 (run 36754585131). Flip-diff **+3,
> zero LOST, zero RETIERED** (tier snapshots at 72727ece → the change). **Mutants 12/12 killed on assertions** (restore byte-identical).
> · **Why phasing:** a mechanism census over the shelf's blocked slots put phasing in 8 slots across 5 decks (Galadriel's
>   Dismissal ×3, Clever Concealment ×2, Talon Gates ×2, Teferi, Master of Time) — the only recurring mechanism among the
>   closest decks' blockers (the Ring, crime, Station, the Pod tutor were one slot each).
> · **Build:** `gameState.phaseOutPermanents` — each target spliced into its controller's phasedOut, everything attached
>   riding INDIRECTLY (CR 702.26g) as `phasedWith` on the target's record, so an opponent's Aura on your creature returns
>   with it at ITS controller's untap, attached, under its own controller. Phase-in keeps both links for a host returning in
>   the same batch, restores riders to their own controllers, and drops a departed controller's rider (CR 800.4a). Atoms:
>   "target creature phases out" (+ the generic up-to-one), "…you don't control…", "any number of target nonland
>   permanents you control phase out".
> · ⚠️ **Teferi's Protection on the same primitive — two shipped gaps closed:** an equipped creature came back ONE-WAY
>   (the Equipment read attachedTo:null while the creature listed it), and an opponent's Aura on a phasing creature was
>   left on a vanished host for the SBA to bin.
> · **Runtime:** `WITNESS cleverConcealment {"targeted":["b","blade"],"phasedOut":["b","blade"],"pacifismGone":true,
>   "stillOutOnTheirUntap":["b","blade"],"back":{"bear":["blade","pac"],"blade":"b","pac":"b"}}` · only your own nonland
>   permanents offered · a real wrath misses a phased-out Bear · Vodalian Illusionist + Brokers Confluence (both unpredicted
>   gains, both witnessed) · a departed rider · Teferi's both-links and Aura-rides-along. Witness
>   `app/src/lib/learn/phasingTargeted.test.js` (10). The engine's post-dispatch AUDIT caught a bad fixture of mine (a
>   Pacifism left on a removed Bear) — fixed the fixture, not the audit.
> · **Mutants 12/12** (+1 removed: an explicit "up to one" arm survived — the generic up-to-one handling already reaches
>   the bare arm). Also dropped before commit: a `phase-out` target-intent case with no consumer yet (no trigger card flips).
> · **Next:** Shalai needs 1 (Galadriel's Dismissal's kicked target swap, Boromir, Skrelv) · Wolverine 88 · Captain America 87.

> ## 🃏 2026-09-30 — SHELF DECKS · D6: "When you cycle this card" — Agonasaur Rex takes **Jurassic Ramp to 90%** · **+13** · corpus 15,034 (43.9%) / 34,245
> Suite **1650 files / 17,048 tests** green (1 skipped); lint 0; decks 89% (2,658 → **2,659** / 2,998). CI GREEN on D5 (run 36751156199). Flip-diff **+13,
> zero LOST, zero RETIERED** (tier snapshots at a6ad2b00 → the change). **Mutants 14/14 killed on assertions** (restore byte-identical).
> · **The card:** Jurassic needed one; Agonasaur Rex's cycle trigger was the cheapest — and cycling was REFUSED outright for any
>   card printing a cycle trigger (parseCyclingCost's blanket gate). 55 corpus cards print the self form; all parked.
> · **Build:** `cycleSelf` detection ("you cycle this card" exactly; "cast or cycle" and "a player cycles" stay undetected;
>   the Sojourners' "… and when this creature dies" arrives split, each half on its own event) · `checkCycleSelfTriggers`
>   (the card as source — CR 702.29c: it triggers from the zone the card ends up in) · fired + flushed in `applyCycle`
>   after the draw is stacked, so it resolves first (CR 603.3 / 405.5) · `triggerRouting.cycleSelfTriggersModeled` — every
>   printed line detected AND routing — read by the cycling offer (only vouched lines leave parseCyclingCost's gate) ·
>   the "up to one target creature or Vehicle" counters arm.
> · ⚠️ **A shipped false positive, fixed:** applyAddCounter placed counters only on a target typed "creature", and the
>   creature-or-Vehicle union tags EVERY pick "permanent" — creatures included. Seven-Tail Mentor, Grafted Growth, Light the
>   Way, Perilous Snare (CV-2, 2026-08-06) classified native with no counter ever landing; their test proved the POOL and
>   never resolved (it now resolves). The "counters on a creature" watchers still count only creatures (an uncrewed Vehicle
>   is not one). Same class in the bound pump ("It gains …" after a permanent-scoped pick granted nothing) — fixed too.
> · **Runtime:** `WITNESS agonasaurCycle {"offered":true,"triggerAboveDraw":true,"bears":"4/4","handBeforeDraw":0,"trample":true,
>   "indestructible":true,"drew":["lib-top"],"rexInGraveyard":true}` · an uncrewed Vehicle takes the counters, and they don't
>   fire Terrasymbiosis (on a creature they do) · no target, still draws · Krosan Tusker's land before the draw · Quakefoot
>   stops a blocker · Bant Sojourners' Soldier on cycling AND on dying · Esper Sojourners (unmodeled) parked, not offered.
>   Witness `app/src/lib/learn/cycleSelfTrigger.test.js` (9) + creatureOrVehicleCounter.test.js (+1 resolution row).
> · **Graduated:** auraKeywordLineResidue's "when you cycle" residue pin — the plain form is native now; the guard stands on
>   "cycle or discard". applyCycle flushes only when a cycle-self trigger fired, so a plain cycle is byte-identical (G14).
> · **Next:** Shalai 88 · Wolverine 88 · Captain America 87 · Otharri 86.

> ## 🃏 2026-09-30 — SHELF DECKS · D5: Ascend and the city's blessing — Arch of Orazca + Wayward Swordtooth (**Jurassic Ramp 87 → 89**) · **+14** · corpus 15,021 (43.9%) / 34,245
> Suite **1649 files / 17,038 tests** green (1 skipped); lint 0; decks 89% (2,656 → **2,658** / 2,998). CI GREEN on D4 (run 36747426857). Flip-diff **+14,
> zero LOST, zero RETIERED** (tier snapshots at 4c661393 → the change). **Mutants 17/17 killed on assertions** (restore byte-identical).
> · **Build:** `ascend.js` — CR 702.131b's grant at the SBA cadence (after the fixpoint, before state triggers): ten or more
>   permanents AND a permanent with the printed Ascend line (not the Un-card's "Ascend MagicCon …"); phased-out permanents
>   uncounted; never removed (702.131c). Readers: interveningIf "you have the city's blessing" (trigger conditions, the
>   "Activate only if" rider, spell conditions); the self can't-attack-or-block gate's blessing window; a per-source
>   `citysBlessing` as-long-as gate kind read live in layers. Spell Ascend (702.131a) not modeled — those spells park.
> · ⚠️ **Two false positives the Ascend line was hiding — both closed before anything flipped:** (1) the chosen-type flat-
>   anthem lane dropped any line that STARTED with the anthem, later sentences unread — Radiant Destiny's gated vigilance
>   would have flipped doing nothing. Now it cuts only the modeled clauses; Radiant Destiny parks; LOST 0 (nothing shipped
>   leaned on it). (2) Temur Elevator's mana line dropped "If you don't have the city's blessing, you lose 1 life" — a
>   painless tri-land. ENFORCED (the FP policy): the loss rides the painland fields, exempted once the controller is blessed.
>   The general land-tier gap (a mana line's trailing rider unread) is the already-tracked "credits mana lines the runtime
>   never offers" item; a census of 113 such lines is in the scratchpad, most riders carried on extra source records.
> · **Graduated pins (6 files):** the city's blessing was THE example of an unevaluable condition in coverage /
>   extraLandDrops / globalCreatureAnthem / staticAbilities / interveningIf / selfAsLongAsGates — each guard now stands on
>   "you have the initiative" (probed unread by both the gate parser and the evaluator), with a positive twin where it was a card.
> · **Runtime:** `WITNESS citysBlessing {"before":false,"after":true,"logged":true}` · not at nine, not without Ascend, not
>   from an opponent's, not for the Un-card, kept under ten, granted once · a real land drop as the tenth · Arch's draw and
>   Orazca Relic's sacrifice only with it · Swordtooth attacks and blocks only with it · flying / +2/+2 / Saprolings / other
>   artifact creatures / double strike only with it, never from an opponent's · Temur Elevator's life per tap until blessed ·
>   Deadeye Brawler's draw on a real connection. Witness `app/src/lib/learn/ascendCitysBlessing.test.js` (16).
> · **Next:** Jurassic Ramp needs 1 more (k=1: Ravenous Tyrannosaurus / Wrathful Raptors / Agonasaur Rex) · Shalai 88 ·
>   Wolverine 88 · Captain America 87.

> ## 🃏 2026-09-30 — SHELF DECKS · D4: "if {R}{R} was spent to cast it" — Vibrance takes **cdh to 90%** + the hybrid ETB family · **+9** · corpus 15,007 (43.8%) / 34,245
> Suite **1648 files / 17,022 tests** green (1 skipped); lint 0; decks 89% (2,655 → **2,656** / 2,998 — cdh 89 → **90**). CI GREEN on D3 (run 36744277824) and the
> citation audit (run 36745606604). Flip-diff **+9, zero LOST, zero RETIERED** (tier snapshots at 3caabc2e → the change). **Mutants 11/11
> killed on assertions** (restore byte-identical).
> · **The card:** cdh needed one; Vibrance's two ETBs ("if {R}{R} was spent to cast it, … 3 damage" / "if {G}{G} … a land to hand,
>   2 life") both parsed — only the condition was missing. Chosen over Talon Gates (cdh + Otharri): a targeted phase-out has to
>   carry the target's Auras/Equipment and re-hook them, and the existing phase-in re-hooks an attachment BEFORE its host is
>   back (a one-way link) — a subsystem slice of its own, noted for later.
> · **Build:** the payment plan's per-colour spend ({W,U,B,R,G,C}), captured beside colorsSpent / manaSpent / manaSpentAmount off
>   the SAME plan, threaded on the permanent spell and stamped `manaSpentByColor` (a free cast: zero; an untallied alternative
>   cost: absent). interveningIf reads "<pips> was spent to cast it" off the entering permanent — every pip covered, generic
>   included, {C} never a colour; not cast → false; untallied → null. Self-ETB form only (the spell form + Adamant park).
> · **Runtime:** `WITNESS vibranceSpent {"spent":{"R":3,"G":2},"aiLife":37,"landToHand":true,"userLife":42}` through the real
>   cast · five Mountains → only the red trigger · one Mountain + four Forests → only the green · Gruul Scrapper's haste when a
>   Mountain paid part of its {3} · Steamcore Weird's 2 only when red paid · a free cast records zero, both refused · uncast
>   (reanimated) → both detected and refused by their conditions. Witness `app/src/lib/learn/spentPipsEtb.test.js` (12).
> · **Mutants 11/11** (+1 removed): the twelfth — a probe tally for parseability — SURVIVED: not-cast already reads a definite
>   false, so the probe needed nothing. Removed.
> · **Next:** Shalai (88, needs 2) · Wolverine (88, needs 2) · Captain America / Jurassic Ramp (87, need 3) — Ascend next.

> ## 📚 2026-09-30 — CITATION AUDIT (docs only): the rules the comments mean + a CR citation checker
> Suite **1647 files / 17,010 tests** green (1 skipped); lint 0. Comments only — no behavior change.
> · **Found while building Ragavan:** the impulse code cited CR 118.10 ("each payment of a cost applies to only one spell")
>   for the play permission. Corrected by what each comment claims — 601.3 cast permission, 305.2 land half, 611.2a stated
>   duration, 514.2 cleanup lapse, 608.2c "this way", 119.3 life lost past 0 (21) · 500.2 → 611.2a for "your next end
>   step" (2) · 608.2m → **608.2n** for the graveyard put (29 + ENGINE-SCAFFOLD; 608.2m is "still resolves fully") · rebound
>   702.88c/d/e → 702.88a (8; d and e do not exist) · "701.x" placeholders → 701.16 / 701.47 / 701.57 (7). The CR skips
>   subrule letters l and o by design (608.2k → 608.2m) — checked across the whole file, not a data gap.
> · **New tool:** `app/scripts/check-cr-citations.cjs` — every "CR nnn.n[x]" citation in app/src must name a rule that
>   exists in the bundled CR (exit 1 otherwise). 7,789 citations; **118 still name no rule** (25 numbers — 701.19e ×22,
>   505.5b ×13, 602.5i ×9, 715.3e ×8, 701.32d ×8, 203.4c ×8, …). Queued as its own slice (a task chip); the checker becomes
>   a lint gate once they read 0. It cannot catch a real rule cited for the wrong thing — that half stays judgment.

> ## 🃏 2026-09-30 — SHELF DECKS · D3: cast a card from another player's exile — **Ragavan, Nimble Pilferer** (cdh + Shalai) · **+1** · corpus 14,998 (43.8%) / 34,245
> Suite **1647 files / 17,010 tests** green (1 skipped); lint 0; decks 89% (2,653 → **2,655** / 2,998 — cdh 88 → 89, Shalai and Hallar 87 → 88). CI GREEN on D2 (run 36740556472). Flip-diff **+1, zero LOST, zero RETIERED** (tier
> snapshots at 55465d4f → the change). **Mutants 30/30 killed on assertions** (restore byte-identical).
> · **The card:** Ragavan sat in two shelf lists, parked on "create a Treasure token and exile the top card of that player's
>   library. Until end of turn, you may cast that card." — the runbook sized it L (H4, 2026-09-04: "nothing in the engine casts
>   an OPPONENT'S card"). Not theft by the standing rule (nothing takes or exchanges control of a permanent).
> · **What already existed:** the foreign-owner seam on PERMANENTS (`perm.owner`, stamped by enterCardFromZone for a reanimated
>   opponent's card; moveCardToZone sends it home on leaving; Homeward Path reads it). What did not: a cast out of another
>   player's zone, an owner on the stack, and an owner on a cast permanent.
> · **Build:** parse — an anchored splitClauses fold (the permission onto the exile half of the " and " split) + one exact arm in
>   matchImpulseExilePlay → impulse-exile who "damagedPlayer" (the existing referent gates keep it to combat damage). Resolver —
>   the damaged player's top card into THEIR exile stamped `_impulseFor` (who may cast it) this turn; no referent / empty
>   library → nothing, never your own card. Offer — other players' exile scanned for cards stamped for you this turn, casts
>   only (the builder never offers a land), `fromPlayerId` naming the owner; the owner's own offer skips a stamped card.
>   Dispatcher — spliced out of the owner's exile, an unstamped card refused (NO_CAST_PERMISSION), the owner stamped on the
>   stack OBJECT (a copy, built fresh, never inherits it — CR 707.10: the copier owns the copy). Home: an instant resolves into
>   its owner's graveyard (CR 608.2n), a countered card goes to its owner (CR 701.6a — counterSpellById's "controller IS its
>   owner" invariant retired), and the permanent / Aura / player-Aura / clone resolvers stamp the owner on what enters.
>   opponentAI.cardFromHand reads the owner's exile through the action (the pilot would have skipped the cast).
> · **CR 400.7 fix riding along:** the impulse stamps now come off a card as it leaves exile (gameState.withoutImpulseStamps,
>   one list shared with the cleanup lapse). The own-library impulse path had the same hole: a card cast from impulse exile
>   and exiled again that turn was castable again. Witnessed for both paths.
> · **Citation audit (my own draft):** I first cited CR 118.10 for the permission, copying the existing impulse comments —
>   118.10 is "each payment of a cost applies to only one spell". The permission is CR 601.3. The pre-existing CR 118.10 /
>   CR 608.2m citations are corrected in their own docs commit next (each checked by context — 608.2n is the graveyard put).
> · **Runtime:** `WITNESS ragavanPilfer {"aiLife":38,"treasures":1,"inAiExile":true,"userMayCast":true,"aiMayCast":false}`
>   through resolveCombatDamage and the real trigger · cast with the Treasure → your control, their card, dies into THEIR
>   graveyard (a bystander card in their exile untouched) · an instant → their graveyard · countered → home · an Aura (and its
>   fizzle), a Curse cast onto a third seat (and its fizzle when that seat leaves), a Clone (chosen, declined, nothing to copy)
>   all keep the owner · a land stays in exile · the window closes at cleanup; a stale stamp grants nothing · re-exiled the
>   same turn, not castable again (and for your own impulse card) · an unstamped cast refused · the AI pilot casts the card
>   its Ragavan exiled · no referent exiles nothing. Witness `app/src/lib/learn/ragavanOpponentImpulse.test.js` (21).
> · **Mutants 30/30:** the parse arm and the fold · the damaged-player branch · the stamp · the owner's own offer admitting it · the foreign scan, its turn check, the owner on the action · the dispatcher's zone read, permission check, CR 400.7 strip, splice, owner's-exile write, disposition, stack owner · enterPermanent's stamp and each resolver threading it (permanent, clone resume / copy / decline / nothing-to-copy, player-Aura enter + fizzle, Aura enter + fizzle) · the counter destination · the shared strip list · the cleanup lapse · both AI lookup halves..
> · **Next:** the citation fix, then Ascend (Jurassic Ramp ×2 + Otharri), Mjölnir (Captain America), Talon Gates (cdh + Otharri).

> ## 🃏 2026-09-30 — SHELF DECKS · D2: move a counter — Nesting Grounds takes **Mothman Cometh to 91%** · **+1** · corpus 14,997 (43.8%) / 34,245
> Suite **1646 files / 16,989 tests** green (1 skipped); lint 0; decks 88% (2,652 → **2,653** / 2,998 — Mothman Cometh 89.8 → 91). CI GREEN on D1 (run 36738445056). Flip-diff **+1, zero LOST, zero RETIERED** (tier snapshots at
> fff4cd17 → the change). **Mutants 8/8 killed on assertions** (restore byte-identical).
> · **The card:** Mothman Cometh sat at 89.8% (88 / 98) and needed one; Nesting Grounds' "{1}, {T}: Move a counter from target
>   permanent you control onto a second target permanent. Activate only as a sorcery." was its whole blocker, and no move-a-
>   counter atom existed. (Diamond City's "Move a shield counter from this land …" is a different shape — its own source, an
>   activation condition — and stays parked.)
> · **Build:** `counters.moveCounterClauseParser` + `applyMoveCounter` (CR 122.5 — remove from the first object, put onto the
>   second; if either half is impossible, nothing moves) on the fight-pair two-target shape: the destination is the primary
>   (role "onto", any permanent), the source the secondary (role "from", a permanent you control carrying a counter — the
>   existing ④-AC `hasCounter` restriction with no counter type; narrower than printed, never wider). ⚠️ My first draft ADDED a
>   second `hasCounter` branch ahead of that one; lint's no-dupe-else-if caught the shadowing before any suite ran — it would
>   have inverted the negated form ("with no counters on them", Damning Verdict). Removed. Which counter is the mover's
>   choice; the house policy is deterministic — a +1/+1 onto your own permanent, a -1/-1 onto another player's, else the kind
>   the source carries most of. The move runs removeCounter → addCounter (the standard put path) and fires the
>   counters-placed watchers when a +1/+1 lands on a creature; a creature a move leaves at 0 toughness dies to the SBA after
>   resolution (CR 704.3) — the explicit mid-resolution lethal check I first wrote SURVIVED its mutant for exactly that
>   reason and was removed.
> · **Runtime:** `WITNESS nestingGroundsMove {"from":1,"onto":1,"groundsTapped":true}` through the real activation · the
>   offered sources are only permanents you control with a counter, the destinations anyone's · onto an opponent's creature
>   the -1/-1 goes (not the more numerous oil), and a second one kills their 1/2 · onto your own the +1/+1 goes · a moved
>   +1/+1 fires Terrasymbiosis, a moved oil counter doesn't · not offered on the opponent's turn · the counter gone by
>   resolution: nothing moves, logged as a clean no-op (no resolve error).
> · **Mutants 8/8:** the arm never matching · the roles swapped · the source pool not narrowed (parser, and the restriction
>   kind) · each side of the house policy · no placed-counter watchers · CR 122.5's nothing-to-take guard removed. Witness
>   `app/src/lib/learn/nestingGroundsMove.test.js` (8).
> · **Next:** Ragavan (cdh + Shalai), Ascend (Jurassic Ramp ×2 + Otharri), Mjölnir (Captain America), Talon Gates (cdh +
>   Otharri).

> ## 🃏 2026-09-30 — SHELF DECKS · D1: tribal digs read the printed capital — Avengers Tower takes **Hulk Smash to 90%** · **+7** · corpus 14,996 (43.8%) / 34,245
> Suite **1645 files / 16,981 tests** green (1 skipped); lint 0; decks 88% (2,651 → **2,652** / 2,998 — Hulk Smash 89 → 90). CI GREEN on ③ · 53 (run 36735818862). Flip-diff **+7, zero LOST, zero RETIERED** (tier snapshots at
> 23e17ccc → the change: Avengers Tower, Director Nick Fury, Courageous Outrider, Kolaghan Warmonger, Commune with Dinosaurs,
> Boromir, Gondor's Hope, Staunch Crewmate). **Mutants 2/2 killed on assertions** (restore byte-identical).
> · **The pivot (Colton, 09-30): "Do my decks"** — and "make or change any tools you want". New dev tool
>   `app/scripts/shelf-residue-map.mjs`: for every blocked card on the sub-90 shelf, the SMALLEST set of oracle lines whose
>   removal makes it classify native (k = 1…3, the census's deletion probe extended), aggregated in DECK SLOTS — shapes
>   alone and in pairs, and per deck. First read: 18 decks under 90%, 259 blocked slots (k=1 78 · k=2 35 · k=3 8 · deep
>   138), 80 slots to put every deck at the bar; the only multi-deck shapes are single cards (Gemstone Caverns — a pre-game
>   seam, excluded; Hydroelectric Specimen; Ragavan; Urza's Saga; Mjölnir; Talon Gates) plus Ascend (three cards). The shelf
>   is card-by-card: closest to the bar first. `scripts/probe-subtype-collision.cjs` now takes its candidate words as
>   arguments.
> · **The bug (found probing Hulk Smash's one missing card):** `parseTutorFilter`'s vocabulary is lowercase, and three
>   raw-oracle matchers (the look-and-reveal dig, the reveal-to-graveyard dig, look-at-the-top-card-take) passed the PRINTED
>   capital — "a Dragon card" — so every curated creature subtype (Dragon, Human, Dinosaur …) was refused there while the
>   lowercase clause paths accepted the same word. Their comments still say "tribal → Arbiter", written before TUT-1 / TF-1
>   curated tribal words: the refusal had become an accident of case. The filter now lowercases its phrase.
> · **"hero" curated** under the list's own criteria: carriers (Avengers Tower, Director Nick Fury); collisions 21, EVERY
>   one a Theros "Hero's Path" challenge card (thp1–thp3 — a non-traditional card type, legal nowhere, never in a library).
> · **Runtime:** `WITNESS tribalDig` — Avengers Tower's real activation over [Grizzly Bears, Captain America, Forest]: only
>   the Hero is offered, it goes to hand, the rest to the bottom · no Hero in the top three: nothing can be taken ·
>   "Spacecraft" (uncurated) still parks.
> · **Mutants 2/2:** the filter left case-sensitive · "hero" not curated. Witness `app/src/lib/learn/tribalDigFilter.test.js`
>   (5).
> · **Graduated (the first gate run caught both, 2 red):** avengersTower.test.js held the Tower at land-partial "on its tutor
>   line" — the line this slice models; it reads land now. impulseDig.test.js kept a Dinosaur dig LOW as its "tribal-filter"
>   row — written before TUT-1 curated Dinosaur; it is pinned HIGH now (+1 test), and an UNCURATED subtype ("a Beast card")
>   holds the tribal boundary in its place.
> · **Next:** Mothman (89.8%, needs 1), then the multi-deck cards — Ragavan (cdh + Shalai), Ascend (Jurassic Ramp ×2 +
>   Otharri), Mjölnir (Captain America; Hulk's second), Talon Gates (cdh + Otharri).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 53: "Spells you cast cost {1} less" + "The second spell you cast each turn costs {N} less" — Stone Calendar, Highspire Bell-Ringer, Uthros Psionicist · **+3** · the LAST residue-loop slice (Colton: decks first) · corpus 14,989 (43.8%) / 34,245
> Suite **1644 files / 16,975 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI GREEN on ③ · 51 (run 36732333163) and on ③ · 52 + the CR 702.30a citation fix (run 36733703566). Flip-diff **+3, zero LOST, zero RETIERED** (tier snapshots at
> 362da3d5 → the change: exactly the three planned). **Mutants 6/6 killed on assertions** (restore byte-identical).
> · **The rows (census ranks 76 + 77, one reducer family):** the static cost-reduction family needed a word before "spells"
>   (a subtype, a colour, a card type), so the bare form never parsed; and no reducer knew its spell's ordinal.
> · **Build:** `{ costReduction: { allSpells: true } }` for the bare "Spells you cast cost {N} less" ("you cast" only — the
>   symmetric Helm of Awakening reaches every player's spells, which the caster-only reducer collection can't express, so it
>   stays parked); `{ costReduction: { nthSpellThisTurn: 2 } }` for "The second spell you cast each turn costs {N} less" —
>   `costReductionForSpell` takes a cast context and applies it only when the caster has cast exactly one spell this turn
>   (`spellsCastThisTurn`, bumped at the cast chokepoint, reset for every seat at untap), FAIL-CLOSED without the count; both
>   call sites in `castActionsFromZone` pass it. Generic only, floored at {0}; the mana value untouched (CR 601.2f / 202.3).
> · **Runtime:** `WITNESS allSpellsReducer {"withCalendar":{"generic":3,"R":1,"cmc":5},"without":null}` — Lava Axe through
>   the real offer with Stone Calendar out; the dispatcher spends exactly four; two Calendars stack; Shock still costs {R};
>   an opponent's Calendar discounts nothing · `WITNESS secondSpellReducer {"first":null,"second":3,"third":null}` with
>   Highspire Bell-Ringer out · no count → no discount.
> · **Mutants 6/6:** each arm never matching (×2) · the all-spells matcher skipped (credited, not played) · the ordinal off
>   by one · fail-open without the count · the cast offer passing no count. Witness
>   `app/src/lib/learn/allSpellsReducer.test.js` (9).
> · **⚠️ The loop ran past its own threshold, and the pivot (Colton, 09-30):** §3 of the 09-06 plan takes only rows with ≥3
>   sole blockers; census-2 runs out of those at rank 29, and every row from ③ · 42 on was a 2-sole row — below the plan's
>   line, unflagged (my miss). The deck aggregate sat at 88% (2,651 / 2,998) through all of it. Colton's order: **"Do my
>   decks"** — the residue loop stops here; the shelf decks' unplayed cards come next, until the v0.161.0 tag on/after 10-02.
> · **Next:** the shelf-deck residue — group the non-native deck slots by blocking line, deck-weighted, and take the class
>   that unparks the most slots.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 52: "Players play with the top card of their libraries revealed" — Wizened Snitches, Field of Dreams · **+2** · rank 74 banked · corpus 14,986 (43.8%) / 34,245
> Suite **1643 files / 16,966 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI: ③ · 51's run 36732333163 concluded before this push. Flip-diff **+2, zero LOST, zero RETIERED** (tier snapshots at
> a160ecac → the change: exactly the two planned). **Mutants 2/2 killed on assertions** (restore byte-identical).
> · **Rank 74 banked — venture into the dungeon (CR 309.1 / 701.49):** no dungeon subsystem exists (the dungeon cards, room
>   abilities, completing a dungeon, the initiative). Machinery, not a row; the venture carriers stay parked.
> · **The row (census rank 75):** the SYMMETRIC form of "Play with the top card of your library revealed", which is already
>   credited inert — revealing a card is information, it changes no game state, and the sim is perfect-information. Lantern
>   of Insight and Yet Another Aether Vortex stay parked on their other lines.
> · **Build:** the same `{ inertInfo }` marker, whole-clause anchored (staticAbilityParser's top-card information arm).
> · **Runtime:** `WITNESS sharedTopCardRevealed` — the offer with and without Field of Dreams on the battlefield is identical.
> · **Mutants 2/2:** the symmetric form not recognized · the whole-clause anchor dropped (a conditional reveal would
>   credit). Witness `app/src/lib/learn/sharedTopCardRevealed.test.js` (3).
> · **Next:** census rank 76 — "Spells you cast cost {C} less to cast" (Stone Calendar): a bare, unfiltered reducer.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 51: "Target player shuffles their graveyard into their library" — Clear the Mind and six more · **+7** · corpus 14,984 (43.8%) / 34,245
> Suite **1642 files / 16,963 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI GREEN on ③ · 50 (run 36730538457). Flip-diff **+7, zero LOST, zero RETIERED** (tier snapshots at
> 9ac3eda4 → the change: Clear the Mind, Reminisce, Learn from the Past, Blessed Respite, Clear, the Mind, Thran Foundry,
> Cranial Archive). **Mutants 3/3 killed on assertions** (restore byte-identical).
> · **The row (census rank 73):** the untargeted "shuffle your graveyard into your library" already ran (Feldon's Cane,
>   Archangel's Light, the Eldrazi titans); the TARGETED form had no parser arm. Primal Command and Quest for Ancient Secrets
>   stay parked on their other text.
> · **Build:** a `libraryKeywordClauseParser` arm → the same `shuffle-graveyard-into-library` atom with targetType "player";
>   `applyShuffleGraveyardIntoLibrary` acts on the CHOSEN player's graveyard and library (no player target → no such player
>   → nothing; never the caster's by default). The cast and activation paths choose the player; as a trigger the side is
>   unprovable (refill your own library vs clear an opponent's graveyard), so atomTargetIntent's default "ambiguous" parks
>   any triggered carrier.
> · **Runtime:** `WITNESS targetedGraveyardShuffle` — Reminisce offered at both players; aimed at the opponent their
>   graveyard goes into their library and the caster's stays · aimed at the caster, their own refills · Clear the Mind also
>   draws · Thran Foundry's real activation exiles itself as the cost and shuffles the chosen graveyard in · no player target:
>   the caster's graveyard is untouched.
> · **Mutants 3/3:** the arm never matching · the atom ignoring the target · a missing target falling back to the caster.
>   Witness `app/src/lib/learn/targetedGraveyardShuffle.test.js` (7).
> · **Graduated (the first gate run caught both, 2 red):** attachActivatedAbility.test.js used "{T}: Target player shuffles
>   their graveyard into their library." as its example of an UNMODELED extra ability — it now uses "{T}: Venture into the
>   dungeon." (still unmodeled), so the residue gate stays tested; and ③ · 46's own spellCommanderLine.test.js had Clear, the
>   Mind parked on this very clause — it now reads native.
> · **Next:** census rank 74 — "When this creature enters, venture into the dungeon" (likely bank: no dungeon subsystem).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 50: "exile up to N target cards from a single graveyard" at any N — Griffnaut Tracker and five more · **+6** · corpus 14,977 (43.7%) / 34,245
> Suite **1641 files / 16,956 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI GREEN on ③ · 48 (run 36727607746) and ③ · 49 (run 36729054390), each pushed after the previous run concluded. Flip-diff **+6, zero LOST, zero RETIERED** (tier snapshots at
> 23942bb9 → the change: Arashin Sunshield, Shred Memory, Famished Ghoul, Qutrub Forayer, Griffnaut Tracker, Digsite
> Conservator). **Mutants 4/4 killed on assertions** (restore byte-identical).
> · **The row (census rank 72):** the zones arm read only "up to THREE target cards from a single graveyard" (Decompose,
>   Rapid Decay, Scarab Feast) while the subset machinery never cared about N; and the ETB-trigger form had no provable side.
>   Gravegouger (its leaves-return), Unlicensed Hearse and Soul-Shackled Zombie stay parked on their other lines.
> · **Build:** the arm takes the printed count (one … five, or digits); `programQueries.atomTargetIntent` extends the "up to
>   ONE target card from a graveyard" rationale to "up to N … from a SINGLE graveyard": optional hate, so the flush chooser
>   aims it at an opponent and takes the empty pick when none has a card — never forced onto its own graveyard — and the
>   single-graveyard subset constraint keeps every pick inside one graveyard (CR 601.2c).
> · **Runtime:** `WITNESS singleGraveyardExile {"user":2,"ai":1}` — Griffnaut Tracker cast through the real offer: two of the
>   opponent's three cards exiled, the caster's two untouched · only the caster's graveyard holds cards → the empty pick ·
>   a four-seat table with a card in each of two opponents' graveyards → exactly one exiled (one graveyard per pick) ·
>   Shred Memory's real offer: every pick from one graveyard, four at most · Famished Ghoul's real activation exiles two.
> · **Mutants 4/4:** the arm reading only "three" · the ETB form not enemy-side · the printed count ignored · the
>   single-graveyard constraint dropped. Witness `app/src/lib/learn/singleGraveyardExile.test.js` (7).
> · **Graduated (the first gate run caught it, 1 red):** gyExile.test.js pinned "Exile up to two target cards from a single
>   graveyard." LOW — "only the printed three-count is anchored", a scope marker like that file's graduated Scarab Feast
>   line, not a hazard. It now pins a count the arm does NOT anchor ("up to X") as the near-miss that stays LOW.
> · **Next:** census rank 73 — "Target player shuffles their graveyard into their library" (Clear the Mind, Reminisce,
>   Learn from the Past).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 49: "copy it for each time you've cast your commander from the command zone this game" — Empyrial Storm, Hatut Zeraze Strike Force · **+2** · corpus 14,971 (43.7%) / 34,245
> Suite **1640 files / 16,949 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI: ③ · 47's run 36726167184 GREEN (anchors ③ · 45–47, whose own runs were cancelled); pushed after ③ · 48's run 36727607746 concluded. Flip-diff **+2, zero LOST, zero RETIERED** (tier snapshots at
> 145c5684 → the change: exactly the two planned). **Mutants 6/6 killed on assertions** (restore byte-identical).
> · **The row (census rank 71):** the Commander 2018/2019 storm cycle's PRINTED self-cast trigger — already detected as a
>   selfCast descriptor, but no parser read its clause, and the spell body carried the trigger sentence. SOLE-blocks Empyrial
>   Storm and Hatut Zeraze Strike Force; Skull Storm and Genesis Storm stay parked on their bodies.
> · **Build (storm's machinery, end to end):** detectTriggers marks the printed descriptor a storm copy with
>   `stormCountSource: "commanderCasts"`; the cast path threads it beside storm's snapshot; `copySpellClauseParser` reads
>   the clause; the copy atom counts `gameState.commanderCastsFromCommandZone` (the per-commander tally the cast chokepoint
>   bumps, CR 903.8 — partners summed) LIVE as the trigger resolves; `stripStormKeywordLine` peels the sentence from the
>   spell's body; coverage's storm branch takes these spells too (trigger must route, body must stand alone). A creature
>   spell's copies become tokens (CR 707.10f) through the existing permanent-spell branch.
> · **Runtime:** `WITNESS commanderStorm {"twice":3,"never":1}` — Empyrial Storm through the real cast with the commander
>   cast twice vs never · partners cast once each → two copies · a commander cast in response (the tally bumped before the
>   trigger resolves) adds a copy · Hatut with one command-zone cast: the card and one TOKEN copy.
> · **Mutants 6/6:** the parser arm · the descriptor not marked · the count source not threaded · the atom ignoring the
>   source · only the first commander counted · the trigger line left in the body. (The storm-branch condition's
>   extension is defense in depth — equivalent for every printed carrier, whose trigger routes — so no kill is claimed
>   for it.) Witness `app/src/lib/learn/commanderStorm.test.js` (6).
> · **Next:** census rank 72 — "When this creature enters, exile up to N target cards from a single graveyard" (Arashin
>   Sunshield, Gravegouger …).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 48: "You have shroud." — Ivory Mask, True Believer · **+2** · and the Curse offer that targeted protected players · corpus 14,969 (43.7%) / 34,245
> Suite **1639 files / 16,943 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI: ③ · 46's run cancelled by concurrency too; this slice was pushed only after ③ · 47's run 36726167184 concluded. Flip-diff **+2, zero LOST, zero RETIERED** (tier snapshots at
> 5c211071 → the change: exactly the two planned). **Mutants 6/6 killed on assertions** (restore byte-identical).
> · **The row (census rank 70):** player shroud (CR 702.18) — ABSOLUTE, unlike hexproof (CR 702.11d, opponents only): the
>   player can't target themself either. SOLE-blocks Ivory Mask and True Believer; Form of the Squirrel and Solitary
>   Confinement stay parked on their other lines.
> · **Build:** `playerShroud` — player hexproof's inert layer-6 op shape; `layers.playerHasShroud` (follows the source's
>   controller); `spellEffects.playerTargetableBy(state, playerId, controllerId)` is now THE player-targetability predicate
>   (shroud absolute · hexproof opponent-scoped · Teferi's protection from everything), read by target enumeration.
> · **Found scoping it — a targeting false positive:** the "Enchant player" Aura offer (Fraying Sanity and the Curses,
>   legalChoices) listed EVERY living player with no targetability check at all, so a Curse could be cast at an opponent
>   behind Leyline of Sanctity or Teferi's Protection. An Aura spell targets (CR 303.4a); the offer now reads the same
>   predicate.
> · **Runtime:** `WITNESS playerShroud` — with True Believer nobody targets the user, the user included; with Leyline the
>   user still targets themself · lifts when it leaves; follows the controller · a real Ancestral Recall can't aim at its
>   shrouded caster, a real Lava Spike can't aim at the Ivory Mask player · `WITNESS curseOffer
>   {"leyline":["ai"],"trueBeliever":["ai"],"teferi":["ai"]}` against the vacuity control (nothing protecting: both players).
> · **Mutants 6/6:** the parser arm · the reader never finding the op · shroud made opponent-scoped · the Curse offer
>   skipping the predicate · the grant ignoring its controller · the enumeration keeping its old closure. Witness
>   `app/src/lib/learn/playerShroud.test.js` (7).
> · **CI discipline (learned today):** ③ · 42, 45 and 46's runs were each cancelled by the next push — slices landed faster
>   than a run finishes (~20 min), so from here a slice is pushed only after the previous run completes.
> · **Next:** census rank 71 — "When you cast this spell, copy it for each time you've cast your commander from the command
>   zone this game." (Empyrial Storm, Hatut Zeraze Strike Force) on the storm copy atom.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 47: "enters with a divinity counter on it if you cast it from your hand" — Myojin of Life's Web, Myojin of Infinite Rage · **+2** · corpus 14,967 (43.7%) / 34,245
> Suite **1638 files / 16,936 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI: ③ · 45's run was cancelled by concurrency (anchored by ③ · 46's); ③ · 46's run 36724907580 in flight at this entry. Flip-diff **+2, zero LOST, zero RETIERED** (tier snapshots at
> 4fcb0b2d → the change: exactly the two planned). **Mutants 6/6 killed on assertions** (restore byte-identical).
> · **The row (census rank 69):** an enters-with-counter replacement (CR 614.1c + 122.6a) gated on HOW the permanent
>   arrived. The counter's readers were modeled already ("has indestructible as long as it has a divinity counter"; "Remove
>   a divinity counter from ~: …") — the enter line alone parked Life's Web and Infinite Rage. Night's Reach, Seeing Winds
>   and Cleansing Fire stay parked on their own ability lines; Neon Dynasty's "… an indestructible counter …" Myojin now
>   clear this line too and park on their remove-counter abilities; Patched Plaything's -1/-1 form is not this reader's.
> · **Build:** `staticAbilityParser.entersWithCastFromHandCounters` — whole-sentence anchored on exactly "if you cast it from
>   your hand", one bare counter word, never a reserved kind; `resolvers.enterPermanent` places it only when `castFromZone`
>   is "hand" (stamped by the cast resolvers only — a reanimated, put-in or command-zone-cast Myojin enters bare, CR 614.1c);
>   coverage strips the line only for an honest kind (isHonestEnterCounterKind); `divinity` joins the inert enter-counter
>   kinds (CR 122.1).
> · **Runtime:** `WITNESS myojinCastFromHand {"divinity":1,"indestructible":true}` — Myojin of Infinite Rage cast through the
>   real offer and stack · its real activation spends the counter: indestructible gone, every land destroyed · Myojin of
>   Towering Might's indestructible counter rides the same reader · put onto the battlefield / cast from the command zone or
>   a graveyard: no counter, not indestructible.
> · **Mutants 6/6:** the reader never matching · the resolver ignoring the zone · the resolver never placing · the
>   honest-kind gate removed (killed by a SYNTHETIC finality-counter fixture — every printed carrier's kind is honest) ·
>   divinity not inert · the coverage strip removed. Witness `app/src/lib/learn/myojinDivinity.test.js` (8).
> · **Next:** census rank 70 — "You have shroud." (Ivory Mask, True Believer): a player-shroud op on the player-hexproof
>   seam, absolute rather than opponent-scoped.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 46: "Spell commander" — Ransack, the Lab; Rampant, Growth · **+2** · corpus 14,965 (43.7%) / 34,245
> Suite **1637 files / 16,928 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI: ③ · 45's run 36723799210 in flight at this entry. Flip-diff **+2, zero LOST, zero RETIERED** (tier snapshots at
> 0f5b1117 → the change: exactly the two planned). **Mutants 2/2 killed on assertions** (restore byte-identical).
> · **The row (census rank 68):** "Spell commander (This card can be your commander. In Limited, it can partner like other
>   monocolored legends.)" — five playtest sorceries, none Commander-legal. The line is a deck-construction permission: it
>   grants no ability and changes nothing about the spell cast from hand, the only way the engine plays them
>   (buildableCommanders never offers a sorcery as a commander). SOLE-blocks Ransack, the Lab and Rampant, Growth; Lava, Axe
>   (its self-named damage line), Clear, the Mind (the graveyard shuffle, rank 73) and Gather, the Townsfolk (fateful hour)
>   stay parked on their own lines.
> · **Build:** `parseHelpers.stripCostOnlyKeywordLines` drops the BARE keyword line (after the reminder, exactly "spell
>   commander" — the cascade/storm precedent), on the one path the classifier and the cast program both read.
> · **Runtime (the real offer, the stack and the AI's picks):** `WITNESS spellCommanderRampant
>   {"forest":true,"tapped":true,"library":["Grizzly Bears"],"inGrave":true}` · Ransack, the Lab: one of the top three to hand,
>   two to the graveyard, the fourth stays · a line that merely mentions the phrase keeps its text.
> · **Mutants 2/2:** the line not stripped · the bare-line anchor loosened to a prefix. Witness
>   `app/src/lib/learn/spellCommanderLine.test.js` (5).
> · **Next:** census rank 69 — the Kamigawa Myojin ("enters with a divinity counter on it if you cast it from your hand";
>   Life's Web and Infinite Rage are blocked by that line alone).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 45: "Cumulative upkeep—Pay N life" — Gallowbraid, Morinfen · **+2** · corpus 14,963 (43.7%) / 34,245
> Suite **1636 files / 16,923 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI green on ③ · 44 (run 36722032962). Flip-diff **+2, zero LOST, zero RETIERED** (tier snapshots at
> f25c0c16 → the change: exactly the two planned). **Mutants 10/10 killed on assertions** (restore byte-identical).
> · **The row (census rank 67):** the em-dash, life-cost form of cumulative upkeep (CR 702.24a). The mana form was modeled
>   end to end (the synthesized upkeep trigger → the `cumulative-upkeep` atom → the shared pay-or-sacrifice choice); the life
>   form reached none of it — the synthesis read only a brace cost, and the keyword-only credit wants a space after "upkeep".
>   SOLE-blocks Gallowbraid and Morinfen; Inner Sanctum, Glacial Chasm and Dystopia stay parked on other lines, Decomposition's
>   QUOTED grant and Infernal Darkness's mixed "{B} and 1 life" are deliberately not read.
> · **Build:** `triggers.CUMULATIVE_UPKEEP_LIFE_RE` — the printed keyword LINE, one definition for the synthesis and coverage's
>   shaped-sentence bump — synthesizes the sentinel "cumulative upkeep pay N life"; matchCumulativeUpkeep maps it to the atom's
>   `{ kind: "life", life }` cost (ward's life shape), the atom scales it by the age counters, and the settle pays it through
>   the ward life settle (CR 119.4: only when the life total covers it; through loseLife). The AI's pick pays only while the
>   payment leaves 10 life — opponentAI's floor for a life-paid alternative cost — so a growing upkeep never pays it toward
>   zero. Coverage: `reCumulativeUpkeepLifeCost` beside `reWardLifeCost`.
> · **Runtime (the real upkeep — advanceStep + the step's actions):** `WITNESS cumulativeUpkeepLife` — 1 life owed, 39, then 2
>   owed, 37; two age counters; Gallowbraid stays · declined: sacrificed, no life paid · at 1 life owing 2: sacrificed, life
>   untouched · exactly enough life pays (to 0) · the AI pays 1 at 40, refuses 2 at 11, pays 2 at 12.
> · **Mutants 10/10:** the synthesis never matching · the matcher's life arm · no escalation · the settle paying nothing · the
>   CR 119.4 gate bypassed · the AI's life arm · the AI floor off by one · the keyword-only credit · the shaped-sentence bump
>   (killed by a SYNTHETIC fixture — no printed card pairs the life form with an otherwise-modeled trigger today) · the line
>   anchor (Decomposition's quoted grant would synthesize its own trigger). Witness
>   `app/src/lib/learn/cumulativeUpkeepLife.test.js` (9).
> · **Banked:** rank 66 waterbend (CR 701.67a–b — "for each generic mana in that cost, you may tap an untapped artifact or
>   creature you control rather than pay that mana"): a tap-to-pay channel limited to the waterbend portion; convoke (702.51)
>   and improvise would share it, and none exists.
> · **Next:** census rank 68 — "spell commander" (Ransack, the Lab / Clear, the Mind / Gather, the Townsfolk / Lava, Axe).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 44: "Spells your opponents cast that target this creature cost {2} more to cast" — Sphinx of New Prahv, Boreal Elemental, Syr Elenora · **+3** · corpus 14,961 (43.7%) / 34,245
> Suite **1635 files / 16,914 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI green on ③ · 43 (run 36719353919 — it also anchors ③ · 42,
> whose run was cancelled by concurrency with test (1) green). Flip-diff **+3, zero LOST, zero RETIERED** (tier snapshots at
> 5efb9ee0 → the change: exactly the three planned). **Mutants 12/12 killed on assertions** (restore byte-identical).
> · **The row (census rank 65):** the mana twin of Terror of the Peaks' life tax — a MANDATORY cast cost (CR 601.2f), not ward.
>   SOLE-blocks Sphinx of New Prahv, Boreal Elemental and (short-name form) Syr Elenora; Icefall Regent, Pursued Whale,
>   Elderwood Scion and Charix stay parked on other lines (Elderwood's "Spells you cast … cost {2} less" would have to
>   reopen casts the offer already skipped as unaffordable — left as residue).
> · **Build:** a `targetManaTax` static arm beside `targetLifeTax`; legalChoices' post-filter becomes `applyTargetTaxes` — the
>   {N} folds into the cast's generic cost (mana value untouched, CR 202.3) and the cast is dropped when the taxed total can't
>   be funded from the sources the payment reads. Those sources are now ONE reader, `manaModel.castPaymentSources` (the
>   dispatcher's EMERGE / AC-1 / W3 exclusions, moved unchanged), so the offer and the payment can't disagree. A free or
>   alternative-cost cast pays no mana on the engine's side while CR 601.2f still adds the tax, so one aimed at a mana-taxed
>   permanent isn't offered (FN-safe). Target ids are de-duplicated: a spell pays each taxer once, however many of its targets
>   name it.
> · **Found building it — a hollow tax:** the three free-cast windows (a pending free cast, cascade, discover) returned BEFORE
>   the tax filter, so a free Murder at Terror of the Peaks paid no life. All three now pass through the choke; each keeps
>   its decline, so a drop never strands a window.
> · **Runtime:** `WITNESS targetManaTaxOffer` — Murder at the Sphinx offered at generic 3 (1 + the tax), mana value 3; at the
>   Bear the printed cost · `WITNESS targetManaTaxPaid {"sphinxTapped":5,"bearTapped":3,"sphinxGone":true}` · three Swamps:
>   the Sphinx cast is not offered, the Bear cast is · the caster's own Sphinx doesn't tax them · a Boreal beside the Sphinx adds
>   nothing to Murder at the Sphinx · Pacifism at the Sphinx needs {3}{W} (an Aura spell targets) · Syr Elenora's short-name
>   clause taxes · Snuff Out's pay-4-life cast isn't offered at the Sphinx · Bone Splinters sacrificing the Eldrazi Spawn can't
>   also crack it for the tax · free cast / cascade / discover at the Sphinx not offered even with {2} open ·
>   `WITNESS freeCastLifeTax {"stamped":3,"lifeAfter":37}` · castPaymentSources' three exclusions pinned directly.
> · **Mutants 12/12:** the arm never matches · the tax not folded in · the unfundable drop removed · the free/alt drop removed
>   · each window skipping the choke (×3) · the caster's own taxer taxing them · every taxer's tax on any taxed target ·
>   castPaymentSources keeping the W3 / emerge / AC-1 victims (×3 — none was pinned before the move; now each is).
>   Witness `app/src/lib/learn/targetManaTax.test.js` (19).
> · **Next:** census rank 66 — waterbend ("As an additional cost to cast this spell, waterbend {C}").

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 43: host-dies triggers fired only on lethal damage — every death site now carries the look-back links · **+0** (a hollow credit closed) · corpus 14,958 (43.7%) / 34,245
> Suite **1634 files / 16,895 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). Flip-diff **zero — GAINED 0, LOST 0,
> RETIERED 0** (tier snapshots at 0bb3f344 → the change; runtime only). **Mutants 7/7 killed on assertions** (restore
> byte-identical).
> · **Found building ③ · 42, measured:** Elephant Guide made its token when its host died to lethal damage (1) and NONE when
>   a destroy spell killed it (0). A dying creature's look-back (CR 603.10a) must carry the attachments that were on it — the
>   host-dies watcher is matched by that list, since the attachment's own `attachedTo` is already cleared — and who damaged it
>   this turn. The SBA look-back (destroyLethalCreatures) and the legend rule carried both; `spellEffects.applyDestroyEffect`,
>   the sacrifice atom (removal.sacrificeCreatureEffect), the activation-cost sacrifice (actionDispatcher), the
>   sac-a-creature mana cost (manaModel.commitManaTap) and the fading sacrifice carried NEITHER. So every "When enchanted /
>   equipped creature dies" trigger and every "dealt damage by ~ this turn dies" payoff missed removal and sacrifice in a
>   real game while the metric credited them — a hollow credit, the runtime FN kind.
> · **Fix:** `gameState.deathLookbackLinks(perm)` — `{ attachments, damagedBy }`, captured before the exit — is the one reader
>   all seven death sites now spread (the two that had it inline included, so the shape can't drift again).
> · **Runtime (each path through its own real entry point):** `WITNESS destroyFiresHostDies {"bearGone":true,"elephants":1}` — a
>   real Murder cast at the enchanted Bear · an unenchanted Bear destroyed makes none (the vacuity control — the host gate
>   still holds) · Sengir Vampire's damagedBy counter on a destroy · Viscera Seer's real activation sacrificing the host ·
>   the sacrifice atom · Ashnod's Altar's mana commit · Skyshroud Behemoth sacrificed to fading at upkeep — each fires Elephant
>   Guide.
> · **Mutants 7/7:** the helper emptied · the SBA look-back without its links · then each repaired site without them — destroy,
>   the sacrifice atom, the mana cost, the activation cost, fading — each killed by its own path's witness. (The legend rule's
>   links only changed shape, so its mutant isn't counted.) Witness `app/src/lib/learn/deathLookbackParity.test.js` (7).
> · **Next:** census rank 65 — Sphinx of New Prahv / Boreal Elemental ("Spells your opponents cast that target this creature
>   cost {C} more to cast").

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 42: "When enchanted creature dies, return that card to the battlefield under your control" — Fool's Demise, Shade's Form and three more · **+5** · corpus 14,958 (43.7%) / 34,245
> Suite **1633 files / 16,888 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI green on ③ · 41 (run 36716328319). Flip-diff **+5, zero LOST,
> zero retiered** (tier snapshots at 897babc8 → the change). **Mutants 5/5 killed on assertions** (restore byte-identical).
> · **Census rank 63 — ⏸ BANKED (machinery):** the Licids (Nurturing / Leeching Licid — "this creature loses this ability and
>   becomes an Aura enchantment with enchant creature. Attach it to target creature. You may pay {C} to end this effect"): a
>   creature-to-Aura self-transform with an ongoing end-cost.
> · **Census rank 64** (Shade's Form #15370, Fool's Demise #13610): the AURA HOST DIES detector fired these, but "that card"
>   names the DEAD host and no atom could bind it — the detector's own note: an effect naming the dead creature "simply fails to
>   parse". The dies look-back already threads the dead card's id (ctx.triggeringCardId): a dies + attached-gated sentinel
>   (`[attached-dies-return-bf:yours]`, triggers.js — the [dies-return-bf] discipline) hands the clause to
>   `selfReturn.applyAttachedDiesReturnYours`, which takes the card from whichever graveyard HOLDS it (its owner's — a stolen
>   host's is not its controller's) onto the battlefield under the ATTACHMENT controller's control ("your", CR 603.3a), owner
>   stamped. Tokens never return (CR 111.7); a card gone is a logged no-op (CR 608.2b). The same line flipped False Demise,
>   Minion's Return, Unhallowed Pact (unplanned — the identical trigger; each run for real).
> · **Runtime (the engine's own death path — lethal damage → destroyLethalCreatures → checkDiesTriggers — then the stack):**
>   `WITNESS foolsDemiseSteal {"userBattlefield":["Hill Giant"],"aiBattlefield":[],"aiGraveyard":[],"owner":"ai","userHand":["Fool's
>   Demise"]}` — your Fool's Demise on the AI's Giant: it comes back to YOU, and the Aura returns to your hand · Shade's Form
>   on your own Bear · a STOLEN host dies into its owner's graveyard and still comes back to you · `WITNESS unplannedCarriers`
>   (all three) · a token never returns · a gone card is a no-op · vacuity controls: Demonic Vigor's "…to its owner's hand"
>   and a synthetic ATTACKS-trigger phrasing stay parked.
> · **A pin GRADUATED with a note:** auraHostDiesTrigger.test.js said "if this ever goes native, the referent has been bound
>   somewhere and needs its own proof" — it is, and foolsDemise.test.js is the proof; the guard moves to the unbound owner's-hand
>   form.
> · **Mutants 5/5:** the rewrite removed · not dies-gated · returned under the OWNER's control · only the dead creature's
>   controller's graveyard searched · the parser arm removed. Witness `app/src/lib/learn/foolsDemise.test.js` (8).
> · **⚠️ Found on the way — ③ · 43 next:** a host killed by a DESTROY effect never fires host-dies Aura triggers — Elephant
>   Guide made a token on SBA death (1) and none on a destroy (0), measured. `spellEffects.applyDestroyEffect` and the
>   hand-built sacrifice / cost look-backs omit the `attachments` (and `damagedBy`) the SBA look-back carries, so
>   checkDiesTriggers can't find the Aura. A hollow credit on every "When enchanted creature dies" Aura (and "equipped creature
>   dies" returns, and "dealt damage by ~ this turn" payoffs) against removal.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 41: "this creature gets +X/+N until end of turn, where X is <count>" — Rubblebelt Rioters, Orcish Siegemaster and six more · **+8** · corpus 14,953 (43.7%) / 34,245
> Suite **1632 files / 16,880 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI green on ③ · 40 (run 36714937690, which anchors ③ · 39 — its own run was cancelled by concurrency, not red). Flip-diff **+8, zero LOST, zero retiered** (tier snapshots at
> 3fb0e468 → the change). **Mutants 6/6 killed on assertions** (restore byte-identical).
> · **Census rank 62** (Orcish Siegemaster #4730, Rubblebelt Rioters #17746): the subtype-target "where x is" pump existed
>   (Magma Sliver's grant); the SELF form had only the symmetric "for each" arm. A combat.js self arm reuses the pump applier's
>   counted lane — ptDeltaCount, ptDeltaCountSlot for the one scaling stat, the count read on the pre-pump board at resolution
>   (CR 608.2h). The same arm flipped six more self carriers: Vile Deacon, Imaryll (attack triggers), Hellkite Igniter,
>   Sokenzan Spellblade, Kitsune Loreweaver, Graverobber Spider (activated, their self-name normalized).
> · **⚠️ A false positive caught by the flip-diff before any gate:** the first draft took `(this creature|it)` and flipped
>   Angelic Exaltation and Team Avatar — "Whenever a creature you control attacks alone, IT gets +X/+X …", where "it" is the
>   TRIGGERING creature; the arm would have pumped the source. Fixed at the right layer: the arm takes "this creature" only,
>   and the detector names a SELF trigger's "it" (triggers.js `SELF_PUMP_X_IT_RE`, gated on scope "self" exactly like
>   SELF_PUMP_IT_RE). Those two stay parked (a safe FN — the triggering-creature form is its own slice).
> · **Runtime:** `WITNESS rioters {"before":"0/4","after":"5/4"}` — beside a 5-power Giant, through checkAttackTriggers and the
>   stack · Orcish Siegemaster alone +0/+0 (the vacuity control), beside a Bear +2/+0 · Vile Deacon counts every Cleric on the
>   battlefield, the opponent's too · Imaryll counts OTHER Elves you control, not itself or an opponent's · Angelic
>   Exaltation's lone attacker untouched · `WITNESS loreweaver {"before":"2/1","after":"2/4"}` — the toughness slot, through the
>   real activation · Hellkite Igniter +2/+0 for two artifacts · Sokenzan Spellblade +1/+0 for one card in hand · Graverobber
>   Spider counts creature cards in the graveyard, not the Forest.
> · **Mutants 6/6:** the arm removed · a bare "it" read as the source (the first draft) · the detector's rewrite not gated on
>   scope · the rewrite removed · the scaling slot ignored · the slot inverted. Witness `app/src/lib/learn/selfCountedPump.test.js` (10).
> · **Next:** census rank 63 (see ③ · 42).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 40: "put target creature card from a graveyard onto the battlefield under your control" on a trigger — Debtors' Knell, Teneb, the Harvester · **+2** · corpus 14,945 (43.6%) / 34,245
> Suite **1631 files / 16,870 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). Flip-diff **+2, zero LOST, zero retiered** (tier snapshots at
> c868ee63 → the change). **Mutants 4/4 killed on assertions** (restore byte-identical).
> · **Census rank 61** (Debtors' Knell #7587; Virtue of Persistence #1886 — see below): the clause parsed HIGH all along; the
>   TRIGGER parked because `atomTargetIntent` called a reanimate from ANY graveyard "ambiguous" — the one-value intent model
>   couldn't prove a side for the flush chooser. There is no side to prove: every reanimate atom that sets anyGraveyard is an
>   "under your control" print (atoms/zones + templateMatchers — checked), so every legal pick helps its controller. The
>   intent is now **"any"**: the chooser's side filter lets it through (it filters only enemy / own / ambiguous), the
>   resolvability gates refuse only "ambiguous", opponentAI's loyalty guard reads it as unsafe (a safe skip). "From an
>   opponent's graveyard" keeps "ambiguous". Which card is BEST is the policy evaluator's question, not a rules one.
> · **Teneb flipped with it (planned — it is why ③ · 39 exists):** its "you may pay {2}{B}. If you do, put target creature card
>   from a graveyard …" rides the optional-payment wrapper, whose intent delegates to the payoff; its target pool needed ③ · 39.
> · **Runtime:** `WITNESS knellCrossGraveyard {"step":"upkeep","userBattlefield":["Debtors' Knell","Grizzly Bears"],"aiGraveyard":[],
>   "owner":"ai"}` — through the real step path (runStepActions(advanceStep(…)) into the upkeep) and the stack, the opponent's
>   Bears enters under your control with its owner stamped · from your own graveyard the same · vacuity controls: empty
>   graveyards and a Plains-only graveyard bring nothing · `WITNESS tenebPays {"aiLife":34,"paid":{"bf":["Grizzly Bears",…],
>   "pool":0},"declined":{…"aiGraveyard":["Grizzly Bears"]}}` — real combat damage, the trigger, pay {2}{B} and the Bears is
>   yours; decline and it stays put.
> · **Pins graduated with notes:** saboteurReanimate.test.js (any-graveyard intent "ambiguous" → "any"); gyRecursion.test.js
>   ("a reanimate-from-ANY trigger routes to the Arbiter" → it is native now, and the guard moves to the opponent's-graveyard
>   form, still off native).
> · **Mutants 4/4:** the arm removed · read as own-side · read as enemy-side · the opponent's graveyard swallowed into "any".
>   Witness `app/src/lib/learn/anyGraveyardReanimate.test.js` (6).
> · **⏸ Virtue of Persistence stays parked — a different blocker, filed as its own task:** the Adventure lane models only a
>   CREATURE half (adventure.parseAdventureCard), so all five Virtues (EDHREC #1886–#3904) fall to the spell classifier. The
>   census's line-deletion probe misreports them — deleting the enchantment's line flips them "native-spell" through the
>   spell path, which is not a fix. Task chip: "Model enchantment Adventures (the Virtue cycle)".
> · **Next:** census rank 62 — Rubblebelt Rioters / Orcish Siegemaster ("Whenever this creature attacks, it gets +X/+0 until end
>   of turn, where X is the greatest power among creatures you control").

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 39: "you may pay {N}. If you do, <targeted payoff>" offered targets wider than printed — 13 native carriers · **+0** (a false positive closed) · corpus 14,943 (43.6%) / 34,245
> Suite **1630 files / 16,864 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI green on ③ · 38 (run 36712437805).
> Flip-diff **zero — GAINED 0, LOST 0, RETIERED 0** (tier snapshots at d8f08f98 → the change; a targeting-only fix).
> **Mutant 1/1 killed on assertions** (restore byte-identical).
> · **Found scoping census rank 61:** Teneb, the Harvester's reanimate trigger found no target with a creature card in the
>   opponent's graveyard. The optional-mana-payment wrapper carries only its payoff's `targetType` (so the trigger locks the
>   target at flush, CR 603.3d); `targeting.atomTargetSpec` read the rest of the spec off the WRAPPER, so every other targeting
>   field of the payoff was DROPPED — the unlisted-field trap. A probe of every wrapper with a chosen target measured 13 NATIVE
>   carriers enumerating wider than printed: Carrion Thrash, Eternal Taskmaster, Genesis, Veinwitch Coven (any card in your
>   graveyard, not a creature card); Consul's Shieldguard, Eddytrail Hawk, Smelted Chargebug (any creature, not "another
>   attacking"); Gryffwing Cavalry (not "attacking without flying"); Haazda Snare Squad, Quiet Contemplation (not "an
>   opponent controls" — the enemy intent partly masked it); Conduit Goblin (itself, not "another"); Jubilant Mascot (one
>   target including itself, not "up to two other"). An illegal target is the forbidden direction.
> · **Fix:** `targeting.targetingAtomOf` — `expandAtoms` enumerates a wrapper from its payoff's chosen-target atom (the parser
>   admits exactly one chosen target type per wrapper); the wrapper's atomIndex stays on the targets (the settler hands them
>   to the payoff) and its intent already delegated the same way. optionalPaymentTargetedPayoff.test.js pinned the thread, the
>   intent and the resolution — never the pool, which is how this hid.
> · **Runtime (pools from expandCastChoices, the flush's own call, source threaded):** Veinwitch Coven offers the Bears, never
>   the Plains or the Bolt beside it · Consul's Shieldguard only the other attacker · Conduit Goblin never itself or an
>   opponent's · `WITNESS mascotChoices ["","a","a+b","b"]` — Jubilant Mascot's up-to-two, never the Mascot ·
>   `WITNESS veinwitchPays {"locked":["gb"],"hand":["Grizzly Bears"],"graveyard":["Plains"]}` — end to end through the real
>   lifegain trigger, the flush, the payment.
> · **Mutant 1/1:** the delegation removed (the pre-fix enumeration) — all five witnesses red, the older optional-payment
>   files green both ways (seen-to-fail). Picking the payoff's first atom regardless of type is unkillable (these payoffs'
>   atoms share one type) and is not counted. Witness `app/src/lib/learn/optionalPaymentTargeting.test.js` (5).
> · **Next:** ③ · 40 — census rank 61, the any-graveyard reanimate intent (Debtors' Knell; Teneb rides it once this lands).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 38: "exile another target permanent. Return that card … at the beginning of the next end step" — Flickerwisp, Glimmerpoint Stag · **+2** · corpus 14,943 (43.6%) / 34,245
> Suite **1629 files / 16,859 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI green on ③ · 36 (run 36709490823) and ③ · 37 (run 36711047058). Flip-diff **+2, zero LOST, zero retiered** (tier snapshots at
> c96d1790 → the change). **Mutants 4/4 killed on assertions** (restore byte-identical).
> · **Census rank 60** (Flickerwisp #2202, Glimmerpoint Stag #17374): the delayed-return blink existed for "exile target
>   creature" (Otherworldly Journey, Turn to Mist — the applier exiles now and schedules a `[blink-return …]` sentinel on the
>   CR 603.7 delayed queue). This is the same applier on the PERMANENT pool: any permanent but the source ("another", CR 109.5
>   — the fail-closed `notSource` restriction the detain lane uses) and NEVER an Aura — a returning Aura's owner chooses what
>   it enchants (CR 303.4f) and the return path has no attach step, so an Aura is not offered (the detain lane's documented
>   narrow FN), never an Aura come back unattached to die.
> · **Runtime (the ETB through enterPermanent → flush → stack; the return through `runStepActions(advanceStep(…))`, the game
>   loop's own end-step drain):** `WITNESS flickerwispPool ["bears","plains","stone"]` — every permanent but Flickerwisp and
>   the Pacifism on the Bears (its host stays in) · `WITNESS flickerwispRoundTrip {"exiled":{…"aiExile":["Mind Stone"],
>   "scheduled":1},"returned":{"onAiBattlefield":true,"newObject":true,"aiExile":[]}}` — an opponent's Mind Stone chosen as
>   the target returns under its OWNER's control as a new object (CR 400.7) · a tapped Plains of your own returns UNTAPPED
>   (the land trick) · a token flickered ceases to exist and nothing returns (CR 111.7).
> · **Chooser side, pinned:** `atomTargetIntent("delayed-blink")` is "own", so the flush chooser never auto-picks an
>   opponent's permanent for the blink — offered only one, the trigger routes to the Arbiter no-op (FN-safe). Printed-legal
>   opponent targets stay reachable through a human's choice and the applier (witnessed above). Play-quality note, not a rules
>   gap: an own-side pick can be a token, which dies — a candidate for the policy evaluator.
> · **Mutants 4/4:** the arm removed · "another" dropped (the source offered) · the Aura exclusion dropped · the pool
>   narrowed to creatures. Witness `app/src/lib/learn/flickerwisp.test.js` (7).
> · **Next:** census rank 61 — Debtors' Knell / Virtue of Persistence ("At the beginning of your upkeep, put target creature
>   card from a graveyard onto the battlefield under your control").

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 37: "Remove a <K> counter from this <noun>: Add …" with no {T} — Pentad Prism and five more · **+6** · corpus 14,941 (43.6%) / 34,245
> Suite **1628 files / 16,852 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI green on ③ · 35 (run 36708158494). Flip-diff **+6, zero LOST,
> zero retiered** (tier snapshots at e64cba01 → the change). **Mutants 10/10 killed on assertions** (restore byte-identical).
> · **Census rank 58** (Pentad Prism #4255, Gemstone Array #13425) and the rest of the vein the line sole-blocks: Crystalline
>   Crawler, Morselhoarder, Workhorse, Druids' Repository. The mana model refused every remove-a-counter mana cost ("not a free,
>   tapless, repeatable source" — reading it minted phantom mana) and coverage stripped the line "until a counter-cost mana
>   subsystem lands". It lands for the no-{T} form.
> · **Machinery (manaModel):** each activation pays ONE counter for ONE mana (colour chosen per activation), so the permanent
>   is as many one-mana sources as it has counters. manaProduction returns a `removesCounters.mode: "each"` product (whole-line
>   anchored, the card's only Add line); manaSources expands it to one record per counter (`repeatable`, `noTap`), usable
>   tapped and summoning-sick (no {T}, CR 302.6) and never multiplied (not tapped for mana); the planner's sibling rule —
>   a permanent's other lines share one {T} and exclude each other — exempts repeatable pairs; the commit removes the counter
>   and does not tap (so no tapped-for-mana watcher fires). The direct `tap-for-mana` action skips it (it would add the mana
>   without paying the counter). Coverage relaxes its strip in lockstep: a counter-cost line survives only when manaProduction
>   models it this way, read on the line itself.
> · **Riders still park (vacuity controls):** Mana Bloom ("Activate only once each turn"), Mana Cache ("Any player may
>   activate…"), Cryptic Trilobite (a spend restriction). The {T}-costed form (Sphere of the Suns, the Vivid lands) is untouched.
> · **Runtime:** `WITNESS carrierRecords` — every carrier, two counters of its own kind → two records of its own colours ·
>   Pentad Prism with none → nothing · a TAPPED Crystalline Crawler and a summoning-sick Workhorse still offer theirs ·
>   `WITNESS prismPaysTwo {"taps":["U","W"],"charge":0,"tapped":false,…}` — {W}{U} from one Prism, two colours, both
>   counters gone, the Prism untapped (one counter can't: the vacuity control) · a Plains pays {W} first and the Prism keeps
>   its counter · Workhorse pays {1} and shrinks to 3; Morselhoarder pays {R} and GROWS to 5 · Mana Reflection doesn't double
>   it · `WITNESS prismCast {"onStack":["Grizzly Bears"],"charge":0,"tapped":false}` — the real cast offered and paid from the
>   Prism alone · no direct tap-for-mana action.
> · **Mutants 10/10:** the manaProduction arm removed · one record carrying every counter · the planner's repeatable exemption
>   removed · the commit tapping anyway · a record removing no counter · a tapped permanent offering nothing · the direct-tap
>   skip removed · coverage stripping the line again · noTap not threaded onto the plan's taps · the avail record dropping
>   `repeatable` (the unlisted-field trap). A too-loose coverage relaxation is unkillable through the native-mana tier —
>   `manaProduction(card)` is a conjunct there — and is not counted. Witness `app/src/lib/learn/counterRemovalNoTapMana.test.js` (12).
> · **⚠️ A near-miss, caught before any gate:** the witness was first Written to `counterRemovalMana.test.js` — ④-4's
>   storage-land witness already had that name, and the Write replaced it. Caught by the Write result ("updated", not
>   "created") and `git status` (` M`, not `??`); restored with `git checkout`, moved to a fresh name, and the mutants re-run
>   with BOTH files. The memory rule already said to glob first; it now names those two signals as stop-the-line.
> · **A comment graduated:** converge.test.js noted Crystalline Crawler "still parks" on this line; it now says when it flipped.
> · **Census rank 59 — ⏸ BANKED (machinery):** Thor, Guardian of Midgard / Virtue of Courage ("Whenever a source you control
>   deals noncombat damage to an opponent, you may exile that many cards …"). No noncombat-damage trigger event exists:
>   gameState.loseLife knows damage is noncombat (`combatDamage: false` from the burn/ability atom) but not the SOURCE's
>   controller, and a pain land reaches it unmarked. Needs an event queue carrying {source controller, damaged player,
>   amount} from every noncombat damage site, the trigger subject, and "that many" threaded into the impulse exile.
> · **Next:** census rank 60 — Flickerwisp / Glimmerpoint Stag ("exile another target permanent. Return that card … at the
>   beginning of the next end step").

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 36: "destroy target nonartifact, nonblack creature" — Shriekmaw, Bone Shredder, Nekrataal, Terror, Expunge, Feast or Famine · **+6** · corpus 14,935 (43.6%) / 34,245
> Suite **1627 files / 16,840 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI green on ③ · 34 + the snapshot chore (run 36707094963).
> Flip-diff **+6, zero LOST, zero retiered** (tier snapshots at bace5fc4 → the change). **Mutants 5/5 killed on assertions**
> (restore byte-identical).
> · **Census rank 56 — ⏸ BANKED (machinery, not a residue row):** Aether Hub / Servant of the Conduit, "{T}, Pay {E}: Add one
>   mana of any color". manaModel strips energy-gated mana on purpose — the planner can't spend energy, so crediting it would
>   mint phantom mana every turn (Solar Transformer is native through its free {T}: Add {C} alone). Needs: an energy-costed
>   product (payEnergy); a SHARED-pool budget in planPayment — energy is one player pool across every source, unlike the
>   storage lands' own counters (the removesCounters two-pass is the precedent: pass A without energy sources, pass B with at
>   most player.energy of them, preferring a source with no other product); commitManaTap spending it; and a UX answer
>   before the human's auto-pay spends energy the player may be saving.
> · **Census rank 57** (Shriekmaw #1546, Bone Shredder #9090): both restrictions were modeled one at a time (Doom Blade's
>   colorNeg, "nonartifact creature"'s typeNeg) and the shared grammar parsed the pair cleanly — but its `cleanedOracle` kept the
>   list COMMA between "target" and the noun once both were stripped, and the fold's isCleanClause refuses any comma. The fix
>   collapses only that span (`target[\s,]+creature`); a comma after the noun still stands and still refuses.
> · **A false positive closed before it could open:** the colour- and type-negation arms recorded only the FIRST negation
>   while their strip removed every one. Unreachable while a comma list parked the card; reachable the moment the list folds —
>   "nonwhite, nonblack" (Seize the Soul) would have read as nonwhite alone and offered a black creature. Both arms now
>   record every negation.
> · **Unplanned flips, both run for real:** Expunge and Feast or Famine print the same clause with Terror's "It can't be
>   regenerated." rider (MTG-001's cannotRegenerate, CR 701.19c — why Terror and Nekrataal flipped with it too).
> · **Runtime:** Terror offered on the Bears only (never the black Walking Corpse, never the artifact Ornithopter) ·
>   `WITNESS shriekmawEtb {"ai":["Ornithopter","Walking Corpse"],"graveyard":["Grizzly Bears"]}` (the real ETB through the
>   stack) · with only the Corpse and the Thopter about, the trigger destroys nothing · Bone Shredder the same ·
>   `WITNESS nonwhiteNonblackPool ["bears"]` (Savannah Lions and the Corpse both refused) ·
>   `WITNESS expungeCast {"ai":["Ornithopter","Walking Corpse"],"graveyard":["Grizzly Bears"]}` (through a regeneration shield) ·
>   `WITNESS feastOrFamineOffers {"destroyTargets":["bears"],"zombieMode":true}` · `WITNESS regenRider
>   {"shriekmaw":{"alive":true,"tapped":true,"shields":0},"nekrataal":{"alive":false,…}}` — against the same shielded Bears,
>   Shriekmaw's destroy is regenerated and Nekrataal's is not.
> · **Mutants 5/5:** the collapse removed · widened to every comma · no longer consuming the comma · only the first colour
>   negation recorded · only the first type negation recorded. Witness `app/src/lib/learn/nonartifactNonblack.test.js` (10).
> · **Next:** census rank 58 — Pentad Prism / Gemstone Array ("Remove a charge counter from this artifact: Add one mana of any
>   color").

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 35: "Enchanted creature can't be the target of spells or abilities your opponents control" — Canopy Cover, Shielding Plax · **+2** · corpus 14,929 (43.6%) / 34,245
> Suite **1626 files / 16,830 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). Flip-diff **+2, zero LOST, zero retiered** (tier snapshots at
> d1a5429b → the change). **Mutants 8/8 killed on assertions** (restore byte-identical).
> · **Census rank 55** (Canopy Cover #4192, Shielding Plax #8121): hexproof's targeting rule in all but name (CR 702.11b) and
>   NOT the keyword, so nothing that reads or pierces hexproof touches it. Both cards' other lines were already credited (the
>   ④-W except-by, the aura-own ETB draw); this line was the sole blocker (the census probe).
> · **Machinery:** the ④-V inert `targetShield` op (Thrun's printed shield) had only the SELF form. The granted form is a
>   `parseAttachedClauseCore` arm emitting it with no colour exception, fixed to the host by the attached-bonus path;
>   `layers.permanentTargetShields` now reads host-FIXED shields too (a granted shield never shields its source — the Aura stays
>   targetable) and returns the SOURCE's controller; `canBeTargetedBy` tests "your opponents" against it, because an Aura may
>   enchant another player's creature (CR 109.5). The shield rides the seam hexproof rides — enforced exactly where hexproof is.
> · **Runtime (targets from legalActionsForPlayer's cast and activate offers):** with no Aura the opponent's Murder and Prodigal
>   Sorcerer reach both Bears (the vacuity control) · `WITNESS canopyCoverSeam {"murder":["b2","ps"],"ping":["b2"],"disenchant":["cover"]}`
>   — the spell and the ability both miss the enchanted Bear; Disenchant still reaches the Aura · the controller's own Giant
>   Growth reaches it · `WITNESS canopyCoverOtherSide {"aiGrowth":false,"userMurder":true}` — the user's Canopy Cover on the
>   AI's Ogre stops the AI targeting its own creature while the user still can · Shielding Plax the same · and the card's
>   other line, now that it is native: `WITNESS canopyCoverBlocks {"covered":{"ground":false,"drake":true,"spider":true},…}`
>   — only a flier or a reach creature blocks the enchanted Bear; the bare one is blockable by all three.
> · **Mutants 8/8:** the arm removed · the arm shielding against everyone · the granted read removed · a granted shield on every
>   permanent · the self read without its mode check (shields the Aura itself) · "your opponents" read off the creature's
>   controller at the seam · a colourless shield refusing nothing · the source controller taken from the shielded permanent.
>   Witness `app/src/lib/learn/canopyCover.test.js` (9).
> · **A pin GRADUATED with a note:** thrunTargetShield.test.js pinned the exact shield shape; it now carries `sourceController`
>   (Thrun's own controller). prowlersHelm.test.js's deliberately tier-agnostic Canopy Cover pin holds unchanged.
> · **Next:** census rank 56 — Aether Hub / Servant of the Conduit ("{T}, Pay {E}: Add one mana of any color"; Solar
>   Transformer is already native).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 34: the attaches the rules forbid do nothing — the Equip lane (CR 301.5c) and Codsworth's Aura half (CR 701.3a) · **+0** (runtime) · corpus 14,927 (43.6%) / 34,245
> Suite **1625 files / 16,821 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI green on ③ · 33 (run 36705415601).
> Flip-diff **zero — GAINED 0, LOST 0, RETIERED 0** (tier snapshots at 0245a38c → the change; a runtime-only slice).
> **Mutants 10/10 killed on assertions** (restore byte-identical).
> · **Not a census row — two holes found scoping ③ · 33.** ③ · 33 put CR 301.5c on the attach-pair resolver; two sites still
>   attached what the rules forbid (an attach that can't happen leaves the attachment where it is, CR 701.3b):
>   1. **The Equip lane** (`resolvers` ATTACH): a crewed Rover Blades paying its own Equip {4} was attached. Now refused via
>      the same `layers.equipmentBarredAsCreature`, and logged as `attach-refused` — never as `attach`, which the log narrator
>      renders as "X attaches to Y". Reconfigure (Lizard Blades) is the exception, as printed.
>   2. **Codsworth's Aura half** (the attach-pair atom): any Aura moved onto any of your creatures — a Wild Growth ("Enchant
>      land") could leave its Forest for a Bear. `auraMayEnchantCreature` reads the Aura's own Enchant line: creature subjects
>      with their restrictions (the shared satisfier), the creature unions, "permanent", and "artifact" / "land" / "nonland
>      permanent" against the host's live types. Everything else refuses (a Curse, a basic land type, an unread restriction) —
>      a safe miss. Shielded by Faith's attach-on-enter move now reads the same helper (one invariant, one reader); its
>      "Enchant creature you control" pin (attachOnEnterAura.test.js) holds.
> · **Runtime:** the uncrewed Rover Blades' Equip attaches (the vacuity control) ·
>   `WITNESS crewedRoverEquip {"attachedTo":null,"bearAttachments":[],"attachLogged":false,"refusal":"CR 301.5c"}` (the real
>   crew action, then the real Equip through the stack) · Lizard Blades reconfigures and stops being a creature · Pacifism moves
>   through Codsworth's real offer · Wild Growth is offered for the Bear, resolves, and stays on its Forest; onto Dryad Arbor it
>   moves · `WITNESS attachLegalityMatrix` — Ice Over → Bear ✓ · Stasis Cocoon → Bear ✗, → Codsworth (an artifact creature) ✓ ·
>   Suppression Bonds → Bear ✓, → Dryad Arbor ✗ · Indestructibility → Bear ✓ · Utopia Sprawl → Bear ✗ · a refused move logs no
>   attach-pair · the documented safe miss: Utopia Sprawl onto Dryad Arbor (a Forest) is refused too.
> · **Mutants 10/10:** the Equip guard removed · the refusal logged as an attach · the attach-pair's Aura check removed ·
>   "Enchant land" admitting any creature · the land branch removed · the creature unions not admitted · "Enchant artifact"
>   ignoring the host · "nonland permanent" ignoring a land host · the "permanent" branch removed · the creature subject's
>   restrictions ignored (killed by attachOnEnterAura's Bound Faith pin — the shared reader). Witness
>   `app/src/lib/learn/attachLegality.test.js` (8).
> · **Rode along (23af8b71, `fix(scripts)`):** `tier-snapshot.mjs --out after.json` — a space where the `=` belongs — fell
>   through to the default path and silently overwrote the TRACKED `app/tier-snapshot.json` (caught mid-③ · 33, restored from
>   HEAD). The script now requires `--out=<file>` or `--diff=<before>,<after>` and exits 2 on anything else before it writes;
>   the two stale tracked snapshots are removed (the release-readiness plan's parked §9 item, done).
> · **Next:** census rank 55 — Canopy Cover / Shielding Plax ("Enchanted creature can't be the target of spells or abilities
>   your opponents control").

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 33: "{T}: Attach target Equipment you control to target creature you control" — Brass Squire, Auriok Windwalker · **+2** · corpus 14,927 (43.6%) / 34,245
> Suite **1624 files / 16,813 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). CI green on ③ · 31 (run 36702493662) and ③ · 32 (run
> 36703642239). Flip-diff **+2, zero LOST, zero retiered** (tier snapshots at 3254800f → the change). **Mutants 7/7 killed on
> assertions** (restore byte-identical).
> · **Census rank 54** (Brass Squire #2616, Auriok Windwalker): the two-target attach existed for Codsworth, Handy Helper's
>   "Aura or Equipment" form (the attach-pair atom, SHELF CAP16). This is the same atom on the narrower pool —
>   `equipmentYouControl`, Captain America's — so an Aura is NOT a legal attachment; the host slot (a creature you control) is
>   unchanged.
> · **A hole both forms shared, closed:** CR 301.5c — "An Equipment that's also a creature can't equip a creature unless that
>   Equipment has reconfigure" — and an attach that can't happen leaves it where it is (CR 701.3b). The resolver never checked:
>   a crewed Rover Blades (an artifact creature until end of turn) would have been moved. `layers.equipmentBarredAsCreature`
>   reads it RIGHT NOW (layer-aware); `layers.hasReconfigure` is now the one reconfigure read the layer-4 half shares.
> · **Runtime (offers from legalActionsForPlayer; the crew is the real crew action; resolution through dispatch + the stack):**
>   `WITNESS brassSquireOffers ["bs->bear","bs->sq"]` — Bonesplitter onto either creature, the Aura beside it never offered ·
>   an opponent's Equipment and creature never chosen · no Equipment → no offer; a summoning-sick Squire can't pay {T} · Auriok
>   Windwalker the same past its Flying line · Bonesplitter moves and the Bear hits for 4 ·
>   `WITNESS roverBladesCrewed {"attachedTo":null,"bearAttachments":[],"bearDoubleStrike":false,"attachLogged":false}` (the
>   same Rover Blades uncrewed moves — the vacuity control) · Lizard Blades (reconfigure) is offered for the Bear and the Squire,
>   never itself (CR 301.5c), moves, and stops being a creature (CR 702.151b) · Codsworth's form refuses the crewed Blades too.
> · **Mutants 7/7:** the arm removed · the arm on Codsworth's Aura-or-Equipment pool · the host slot unrestricted · the guard
>   removed · the reconfigure exception dropped · the guard reading the PRINTED type line instead of the layers · the shared
>   reconfigure read losing its multiline flag. (Flipping the atom's `distinct` flag is unkillable by construction — the
>   enumerator enforces distinctness for every two-target atom — and is not counted.) Witness
>   `app/src/lib/learn/brassSquire.test.js` (11).
> · **A stale pin GRADUATED with a note:** equipRider.test.js pinned Brass Squire's clause LOW to prove it never modeled as
>   attach-to-self; it now asserts the clause parses as attach-pair — the same guard, stated positively.
> · **Next:** census rank 55 — Canopy Cover / Shielding Plax ("Enchanted creature can't be the target of spells or abilities
>   your opponents control").

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 32: "Each creature you control can block an additional creature each combat" — Brave the Sands, High Ground · **+2** · corpus 14,925 (43.6%) / 34,245
> Suite **1623 files / 16,802 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,651 / 2,998). Flip-diff **+2, zero LOST, zero retiered** (tier snapshots at 1e2fe493 → the
> change). **Mutants 5/5 killed on assertions** (restore byte-identical).
> · **Census rank 52** (Brave the Sands #1792, High Ground): multi-block existed for the SELF static (Selesnya Sagittars / Palace
>   Guard — combatEvasion.maxBlocksOf, capped at the declare-blockers offer, damage divided at resolution per CR 510.1d); the TEAM
>   static was listed in that file as a known safe FN.
> · **Build:** the team form is CUMULATIVE — both cards' bundled rulings ("If you have a creature that can already block an additional
>   creature, now it can block three creatures"; two Brave the Sands → three) — so `combatEvasion.maxBlocksFor(state, perm,
>   controller)` adds one block per team static the blocker's controller has (an unlimited cap stays unlimited), and the offer reads
>   it. One core pattern feeds the runtime reader and the classifier mirror (isEnforcedEvasionClause), per the file's lockstep law.
> · **Runtime (blocks offered by legalActionsForPlayer; damage resolved for real):** a Hill Giant already blocking is offered
>   nothing more (the vacuity control) · `WITNESS highGroundOffers {"afterOne":["g::a2","g::a3"],"afterTwo":[]}` — re-offered
>   against the other two attackers, never the same one, and stops at two · two High Grounds → a third block; Selesnya Sagittars
>   under one → a third · Brave the Sands adds the same; Palace Guard stays unlimited · High Ground on the ATTACKER's side raises
>   nothing · at resolution the Giant blocking two Bears deals 2 + 1 and takes 4.
> · **Mutants 5/5:** the classifier mirror removed · the cap ignoring the team statics · every player's statics counted · not
>   cumulative · the offer asking for nobody's statics. (Adding the team count to an unlimited cap is unkillable by construction —
>   Infinity + n — and is not counted.) Witness `app/src/lib/learn/highGround.test.js` (7).
> · **A stale pin GRADUATED with a note:** combatStatics.test.js pinned High Ground's team line as parked ("the [SAP] lane, not this
>   slice"); it is credited now. The activated this-turn and monarch-gated variants beside it stay parked.
> · **Census rank 53 — ⏸ BANKED:** Scion of Opulence / Hedron Detonator, "Sacrifice two artifacts". Artifacts are not fungible,
>   so it is ③ · 6's fork (enumerate every pair, or auto-pick one set) — Colton's call, and Shorikai's identical cost is parked
>   on the same reasoning (🅿 CHOICE-EVAL).
> · **Next:** census rank 54 — Brass Squire / Auriok Windwalker ("Attach target Equipment you control to target creature you
>   control").

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 31: "Return a Forest you control to its owner's hand: Untap target creature" — Quirion Ranger, Scryb Ranger · **+2** · corpus 14,923 (43.6%) / 34,245
> Suite **1622 files / 16,795 tests** green (1 skipped); lint 0. Flip-diff **+2, zero LOST, zero retiered** (tier snapshots at ffddadc2 → the
> change). **Mutants 3/3 killed on assertions** (restore byte-identical).
> · **Census rank 51** (Quirion Ranger #2258, Scryb Ranger #5322): the return-a-land cost (Oboro's "Return a land you control to its
>   owner's hand") refused a subtyped land by its whole-item anchor, so both Rangers parked while their untap and once-each-turn
>   limit were modeled.
> · **Build:** the cost carries a basic land type (Forest / Island / Swamp / Mountain / Plains), and legalChoices' return-land victim
>   filter reads it word-bounded on the type line — the sacrifice-a-Swamp costs' idiom: a dual printed with the type qualifies, a
>   land without it never does.
> · **Runtime (each offered by legalActionsForPlayer and paid for real):** beside only an Island — nothing offered (the vacuity
>   control) · `WITNESS quirionVictims ["bp","fo"]` — the Forest and Breeding Pool pay, the Island never · returning the Forest
>   untaps a tapped Llanowar Elves and puts the Forest in hand · once each turn: with a second Forest out, not offered again ·
>   Scryb Ranger pays the same way.
> · **Mutants 3/3:** the subtype arm removed · the subtype never recorded · the victim filter ignoring it. Witness
>   `app/src/lib/learn/quirionRanger.test.js` (6).
> · **A stale pin GRADUATED with a note** (the first full suite was red on exactly this): untapTargetLand.test.js pinned "Return a
>   Forest" as unmodeled → null (the CREED's safe FN of its day). It now pins the subtype contract the victim filter enforces.
> · **Next:** census rank 52 — Brave the Sands / High Ground (a creature blocking an additional creature — multi-block).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 30: "Whenever a creature you control becomes blocked, …" — Grazilaxx, Cunning Evasion, Somberwald Alpha, Unstoppable Ash, Close Quarters · **+5** · corpus 14,921 (43.6%) / 34,245
> Suite **1621 files / 16,789 tests** green (1 skipped); lint 0. Flip-diff **+5, zero LOST, zero retiered** (tier snapshots at a3fa08b7 → the
> change). **Mutants 6/6 killed on assertions** (restore byte-identical).
> · **Census rank 50** (Grazilaxx, Illithid Scholar #1903; Cunning Evasion): three pieces, each missing. (1) The watcher SUBJECT —
>   "a creature you control becomes blocked" → becomesBlocked / creatureYouControl. (2) The FAN-OUT — checkBlockTriggers fired
>   becomes-blocked only on the blocked creature's OWN triggers, so a watcher never heard it; the attacker's controller's other
>   permanents do now (checkAttackTriggers' "other watchers" loop), the attacker as the triggering permanent. (3) The payoff's
>   "it" is the BLOCKED creature, never the watcher — rewritten, event- and scope-gated, to the triggering-creature bounce the
>   bounce parser already reads; the "you may" stays.
> · **Two more reasons the runtime witness exists:** with the subject and the rewrite in, both cards classified native BEFORE the
>   fan-out existed — Cunning Evasion could never have fired (mutant E2: the fan-out removed, the metric still says native; only
>   the runtime rows go red). And the fan-out's creatureYouControl scope filter cannot be exercised by any corpus card (no other
>   becomes-blocked scope exists) — kept as the safe narrowing, NOT counted as mutation-checked.
> · **Planned two, five moved:** Grazilaxx and Cunning Evasion + three unplanned carriers of the same subject whose payoffs already
>   parsed — Somberwald Alpha (+1/+1), Unstoppable Ash (+0/+5), Close Quarters (1 damage to any target). Each run for real.
> · **Runtime (through checkBlockTriggers → the stack):** a blocked Bear with no Cunning Evasion stays (the vacuity control) ·
>   `WITNESS evasionBounce {"bears":"hand","evasion":"battlefield"}` · declining keeps the Bear in combat · of two attacking
>   Bears only the blocked one goes home · Grazilaxx blocked returns itself, one trigger not two · the AI's blocked attacker never
>   reaches the user's Cunning Evasion · Somberwald Alpha pumps the blocked Bear to 3/3 (the Alpha stays 3/2) · Unstoppable Ash
>   makes it 2/7 · Close Quarters puts 1 damage on the AI's side.
> · **Mutants 6/6:** the subject removed · the fan-out removed · the fan-out visiting the attacker itself (a double fire) · the
>   rewrite removed · "it" bound to the watcher · the "you may" dropped. Witness `app/src/lib/learn/cunningEvasion.test.js` (10).
> · **A stale pin GRADUATED with a note** (the first full suite was red on exactly this): gustcloakEscape.test.js pinned Gustcloak
>   Savior's group watcher as UNDETECTED because "checkBlockTriggers has no fire path" for it. It has one now, so the subject is
>   detected; the card still parks on its payoff (untapping and removing the TRIGGERING creature from combat is not modeled — the
>   escape atom is self-only), and that body-only guard stays.
> · **Next:** census rank 51 — Quirion Ranger / Scryb Ranger.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 29: "Destroy all artifacts, creatures, and enchantments" — Nevinyrral's Disk, Akroma's Vengeance, Magus of the Disk · **+3** · corpus 14,916 (43.6%) / 34,245
> Suite **1620 files / 16,779 tests** green (1 skipped); lint 0. Flip-diff **+3, zero LOST, zero retiered** (tier snapshots at a2c540dc → the
> change). **Mutants 5/5 killed on assertions** — one per wiring site (restore byte-identical).
> · **Census rank 49** (Nevinyrral's Disk #1926; Akroma's Vengeance #6281 and Magus of the Disk carry the same clause; Nevinyrral,
>   Urborg Tyrant parks on its hexproof-from line and reflexive payoff). The mass-destroy family had the pair "artifacts and
>   enchantments" but not the triple — the clause parsed low.
> · **Build — one scope, every site a wipe scope needs:** `eachArtifactCreatureOrEnchantment` in the removal parse; the clause
>   splitter's anchored keep-whole (the comma and the " and " both join types inside one target); atomTargets (+ the load-time
>   handled set) — the LAYER-AWARE creature set the Wrath path uses, plus every artifact and enchantment by type line like the
>   pair, each permanent once; MASS_WIPE_SCOPES, so the AI holds it like any wipe; and the creature-wipe query, so the AI's
>   "cast a held wipe when clearly behind" heuristic can unlock it (it answers a creature board).
> · **Runtime (on one mixed board — each kind the wipe must hit and each it must miss):** the board as dealt (the vacuity
>   control) · `WITNESS diskWipe ["Darksteel Ingot","Forest","Jace Beleren"]` — the Disk, activated for {1}, destroys itself,
>   Mind Stone, Glorious Anthem, Grizzly Bears and the Dryad Arbor land creature; the basic land, the planeswalker and the
>   indestructible Ingot stay · Akroma's Vengeance cast from hand leaves the same three.
> · **Mutants 5/5:** the triple removed from the parse · the splitter's keep-whole removed · the creature half dropped · not an
>   AI-held wipe · not a creature wipe to the AI. Witness `app/src/lib/learn/massTripleWipe.test.js` (5).
> · **Next:** census rank 50 — Cunning Evasion / Grazilaxx ("whenever a creature you control becomes blocked, you may return it").

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 28: "Protection from black and from red" — both Akromas, Mirran Crusader, Auriok Champion … · **+11** · and a runtime protection bug on 7 cards · corpus 14,913 (43.5%) / 34,245
> Suite **1619 files / 16,774 tests** green (1 skipped); lint 0. Flip-diff **+11, zero LOST, zero retiered** (tier snapshots at 1cb7f918 → the
> change). **Mutants 4/4 killed on assertions** (restore byte-identical).
> · **Census rank 42** (the rank skipped at ③ · 24): the runtime enforced both colours all along — protection.parseProtectionColors
>   splits "and from", and layers.permanentProtectionColors feeds the three sites (blocking, targeting, combat damage). Only the METRIC
>   was wrong: coverage.isKeywordOnly splits clauses on " and ", so the line became "protection from black" + a bare "from red" no
>   keyword credits — a sibling asymmetry (the same card with ONE colour classified native). **Build:** the colour list is joined
>   into one clause before the split — colour words only, the words the runtime reader enforces; a non-colour quality after "and
>   from" (Baneslayer's Demons, Greensleeves' Wizards) still splits and parks. A replacer function (the $-expansion gotcha).
> · **The witness caught a runtime bug the metric fix would have hidden.** Mystic Crusader's protection set was EMPTY at runtime:
>   the reader skips an "as long as" protection by testing its sentence, and the sentence ended at the next PERIOD only — a keyword
>   line prints none, so the sentence ran into the threshold line's "As long as …" and the unconditional protection was dropped.
>   Crediting the card native on the metric fix alone would have been a false positive. **Fixed at the reader**
>   (`protectionSentence`, shared by the colour and class readers): the sentence ends at a line break too. Seven cards had lost
>   printed protection this way — Blood Baron of Vizkopa, Spirit of the Night, Mystic Crusader, Mystic Enforcer, Nantuko
>   Blightcutter, Ivory Guardians, Beasts of Bogardan (found by sweeping the corpus for exactly that boundary difference).
> · **Gained (each read for real):** Akroma, Angel of Wrath, Akroma, Angel of Fury, Sphinx of the Steel Wind, Mirran Crusader,
>   Phyrexian Crusader, Paladin en-Vec, Auriok Champion, Mystic Crusader, Stillmoon Cavalier, Great Sable Stag, Sabertooth Nishoba.
> · **Runtime:** `WITNESS pairProtection` — all eleven read exactly their two printed colours at the reader the three sites consult ·
>   an attacking Auriok Champion can't be blocked by Walking Corpse or Gray Ogre, can by Grizzly Bears (Savannah Lions, the
>   unprotected control, by all three) · Lightning Bolt can't target it but can target the Lions; Giant Growth can target both ·
>   blocking Gray Ogre it takes nothing, the Lions take the damage · `WITNESS lineBreakProtection` — the six others keep their printed
>   protection · Etched Champion, Mystic Familiar and Pristine Angel (same-sentence conditions) are still not printed protection.
> · **Mutants 4/4:** the metric join removed · the join admitting any quality · the sentence end back to period-only · the
>   conditional skip dropped. Witness `app/src/lib/learn/protectionTwoColours.test.js` (8).
> · **Next:** census rank 49 — Nevinyrral's Disk / Magus of the Disk.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 27: "Sacrifice [another] artifact or creature" as an ACTIVATED cost — Umbral Collar Zealot, Bartolomé del Presidio, Dockside Chef, Baron Bertram Graywater … · **+18** · corpus 14,902 (43.5%) / 34,245
> Suite **1618 files / 16,766 tests** green (1 skipped); lint 0. Flip-diff **+18, zero LOST, zero retiered** (tier snapshots at 7c86424b → the
> change). **Mutants 4/4 killed on assertions** (restore byte-identical).
> · **Census verdicts (ranks of the re-run census, now cited by rank):** rank 46 — Crystal Barricade (#2102) / Tajic's "Prevent all
>   noncombat damage that would be dealt to other creatures you control" — **BANKED behind a finding**: every creature damage mark
>   ends in gameState.markCombatDamage, but combat.js's fight / one-sided-bite / self-power paths call it DIRECTLY — no source,
>   no prevention, no damage replacement, no lifelink or infect — so a group noncombat wall could not be honest while a fight
>   skips every wall. Filed as its own task (route fight and bite damage through the damage pipeline). Ranks 47–48 are this slice.
> · **A correction:** at ③ · 24 the census went from rank 41 (Ancient Stone Idol) to ranks 43–44 (Clearcutter banked, Murderous
>   Rider) and rank 42 — "protection from black and from red" (Auriok Champion #3626, Mystic Crusader) — got no verdict. It is
>   next.
> · **Build — a drifted copy, not a missing mechanic.** The cast lane has read the union since Deadly Dispute (castModifiers'
>   SAC_TYPE_CANON → `artifactOrCreature`, evaluated by legalChoices.sacTypeMatches). The activated lane kept its OWN copy of the
>   union map and never learned either ordering — the drift sacUnionCost.test.js's one-evaluator contract warns about. The
>   activated lane now imports castModifiers' map (castModifiers imports only parseHelpers, no cycle) and its regex takes both
>   orderings.
> · **Planned four, eighteen moved:** Dockside Chef (#3135), Kingpin's Enforcers, Bartolomé del Presidio (#1740), Hammerhead + fourteen
>   unplanned carriers of the same cost — Umbral Collar Zealot (#1498), Baron Bertram Graywater (#4221), Old Flitterfang, Stormclaw
>   Rager, Acolyte of Aclazotz, Ahriman, Dreg Recycler, Cutthroat Centurion, Defiant Salvager, Laurine, Makeshift Munitions,
>   Thraxodemon, Vito's Inquisitor, Warehouse Thief. **Each run for real** (a generated sweep over the bundled oracle): offered,
>   paid with a real victim, resolved with no error — the off-union Swamp never offered, the source its own victim exactly when
>   the wording allows ("an", not "another", on an artifact or creature — Makeshift Munitions, an enchantment, never).
> · **Runtime:** Bartolomé beside only a Swamp — nothing offered (the vacuity control) · `WITNESS bartolomeVictims ["bb","tr"]` —
>   the Treasure and the Bears, never the Swamp, never itself · sacrificing the Treasure leaves a +1/+1 counter on Bartolomé ·
>   Hammerhead's short name reads the same · Dockside Chef draws off {1}{B} and a Treasure and may sacrifice itself · Kingpin's
>   Enforcers without its {2}{B} is not offered.
> · **Mutants 4/4:** the union alternatives removed · no canonical key (the raw phrase reaches the evaluator) · "another" ignored ·
>   the evaluator admitting any permanent (red on the Swamp). Witness `app/src/lib/learn/sacArtifactOrCreature.test.js` (26).
> · **Next:** census rank 42 — "protection from black and from red".

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 26: "whenever a creature you control with power 2 or less attacks" — Raid Bombardment, Cavalcade of Calamity · **+2** · corpus 14,884 (43.5%) / 34,245
> Suite **1617 files / 16,740 tests** green (1 skipped); lint 0. Flip-diff **+2, zero LOST, zero retiered** (tier snapshots at 55702212 → the
> change). **Mutants 5/5 killed on assertions** (restore byte-identical).
> · **Census row ㉕ itself** (Raid Bombardment EDHREC #3390, Cavalcade of Calamity): ③ · 25 built the payoff; this is the subject.
> · **Build:** `attackMaxPower` — the attack twin of Welcoming Vampire's etbMaxPower, read at DECLARATION off the attacker's
>   CURRENT power (layers.permanentPower: a pumped creature stops qualifying, a shrunk one starts), where the enters gate reads
>   the printed card. Listed in the descriptor assembly (unlisted = fires for every attacker); gated in scopeMatches, failing
>   closed without state. The payoff arm takes the watcher's wording "… that creature is attacking" — the triggering attacker's
>   declared defender, from the same per-attacker context.
> · **The placement trap, a third time:** the first draft of the subject arm sat beside the bare "a creature you control
>   attacks" arm, below triggers' blanket "with …" reject, and was never reached (detectTriggers returned []). Moved above the
>   reject, beside the mana-value-floor ETB arm, whose note records the same lesson.
> · **Runtime (through checkAttackTriggers → the stack):** a 3/3 attacking alone — nothing (the vacuity control) ·
>   `WITNESS raidTwoOfThree {"aiLifeLost":2}` — two 2/2s and a 3/3 attack, the 3/3 doesn't count · a 2/2 with a +1/+1 counter
>   doesn't trigger it and a 3/3 with a -1/-1 counter does · Cavalcade: a 1/1 triggers, a 2/2 doesn't · a 2/2 attacking Jace
>   Beleren takes a loyalty counter off Jace · the AI's small attackers don't trigger the user's Raid Bombardment.
> · **Mutants 5/5:** the arm removed · the cap unlisted in the assembly · the gate reading the PRINTED power · the gate off by
>   one · the payoff's "that creature is attacking" form removed. Witness `app/src/lib/learn/raidBombardment.test.js` (7).
> · **Next:** the census below row ㉕ — Crystal Barricade / Tajic, Bartolomé / Hammerhead, Kingpin's Enforcers / Dockside Chef.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 25: "… deals 1 damage to the player or planeswalker it's attacking" — Hellrider, Scorch Spitter, Rakdos Roustabout · **+3** · corpus 14,882 (43.5%) / 34,245
> Suite **1616 files / 16,733 tests** green (1 skipped); lint 0. Flip-diff **+3, zero LOST, zero retiered** (tier snapshots at daec1e93 → the
> change). **Mutants 6/6 killed on assertions** (restore byte-identical).
> · **Found under census row ㉕** (Raid Bombardment, Cavalcade of Calamity — "Whenever a creature you control with power 2 or less
>   attacks, this enchantment deals 1 damage to the player or planeswalker that creature is attacking"): the PAYOFF was unbuilt
>   everywhere it is printed, not only there. Built first for the three carriers that need nothing else; the row itself — the
>   power-filtered attack subject — is ③ · 26.
> · **Build:** stack.js reads "… deals N damage to the player or planeswalker it's attacking" as the defending-player arm's twin
>   that also reaches a PLANESWALKER: targetType `attackedDefender`, resolved to ctx.defenderPlaneswalkerId (the attacked
>   planeswalker, and nothing if it has left — never its controller instead) or else ctx.defenderId; who:"defendingPlayer" rides
>   the DEFENDING_PLAYER_EVENTS routing gate. checkBlockTriggers threaded only the player for becomes-blocked / attacks-unblocked,
>   so a blocked Rakdos Roustabout attacking a planeswalker would have hit its controller — both contexts carry the planeswalker
>   marker now, as the declare-attackers context always did.
> · **The witness caught a hollow credit before commit — the documented drift trap, a third time.** The first run classified all
>   three native while the flush logged `trigger-removed-no-target` and dealt nothing: a new referent targetType must be
>   registered in targetTypes' NON_CHOSEN set, exactly as `discardingPlayer`'s note warns. Registered; and mutant H5 shows the
>   classifier still credits native with the registration removed — the metric cannot see this trap. A corpus-level guard is
>   filed as follow-up work.
> · **Runtime (through checkAttackTriggers / checkBlockTriggers → the stack):** two Bears attack with no Hellrider — nothing (the
>   vacuity control) · `WITNESS hellriderSwing {"aiLife":-3,"jaceLoyalty":0}` — Hellrider and two Bears, three triggers · a Bear
>   attacking Jace Beleren under Hellrider takes a loyalty counter off Jace and leaves the AI's life alone · Jace gone before the
>   trigger resolves: nothing dealt · Scorch Spitter deals its 1 · Rakdos Roustabout blocked deals 1 to the AI, and to Jace when
>   it is attacking Jace · unblocked, nothing.
> · **Mutants 6/6:** the arm removed · who dropped (red on the routing pin) · the planeswalker ignored · a gone planeswalker
>   falling back to its controller · the non-chosen registration removed · the becomes-blocked context without the planeswalker.
>   Witness `app/src/lib/learn/attackedDefenderDamage.test.js` (9).
> · **Next:** ③ · 26 — row ㉕ itself: Raid Bombardment / Cavalcade's power-filtered attack subject.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 24: "when this creature dies, put it on the bottom of its owner's library" — Murderous Rider, Fell Horseman · **+2** · corpus 14,879 (43.4%) / 34,245
> Suite **1615 files / 16,724 tests** green (1 skipped); lint 0. Flip-diff **+2, zero LOST, zero retiered** (tier snapshots at f386bc9d → the
> change). **Mutants 5/5 killed on assertions** (restore byte-identical).
> · **Census verdicts below row ㉒ (probed):** Goblin Clearcutter / Orcish Lumberjack ("{T}, Sacrifice a Forest: Add three mana in
>   any combination of {R} and/or {G}") — **BANKED**: the production is expressible ({colors:[R,G], amount:3}, per-pip), but
>   "Sacrifice a Forest" is a mana-ability cost the payment planner would have to thread against its own Forest taps — the classic
>   Lumberjack line taps the Forest for {G} first and then sacrifices it, so a commit that picks a Forest the same plan still means
>   to tap leaves the plan unpayable mid-commit. SG-3's creature sacrifice (Ashnod's Altar) is the nearest machinery. Then
>   **census row ㉔:** Murderous Rider (EDHREC #1620), Fell Horseman.
> · **Build:** the dies-trigger self-tuck the "shuffle it into its owner's library" op already resolves (Angel of Fury, Worldspine
>   Wurm) — the card is found in its owner's graveyard — with `toBottom`: a plain library append (index 0 is the top), no shuffle.
>   detectTriggers names the SELF dies trigger's "it" ("this creature"), gated to that event and scope; the arm takes only
>   "this creature". A bare "it" elsewhere is another object — The Cauldron of Eternity's and Zask's dying creature, Neera's
>   spell — and stays unparsed: an ungated arm would tuck the SOURCE, a false positive. Pinned.
> · **Runtime (the Rider cast from hand, then lethal damage):** Grizzly Bears dies and stays in the graveyard (the vacuity
>   control) · `WITNESS riderToBottom {"graveyard":0,"bottom":"Murderous Rider // Swift End","above":6}` — under the six library
>   cards, their order untouched (off the battlefield it is the whole adventure card again) · Fell Horseman the same · the card
>   exiled out of the graveyard before the trigger resolves moves nothing (CR 608.2b).
> · **Mutants 5/5:** the rewrite removed · the self-dies gate dropped (red on the Cauldron pin) · the arm taking a bare "it" ·
>   the graveyard path shuffling anyway · the arm dropping toBottom. Witness `app/src/lib/learn/murderousRiderBottom.test.js` (6).
> · **A stale pin GRADUATED with a note:** adventure.test.js pinned Murderous Rider body-only as the "creature half unmodeled,
>   adventure half modeled" guard; that guard moves to Lovestruck Beast (its "can't attack unless you control a 1/1 creature"
>   is unmodeled, Heart's Desire's 1/1 Human token is), found by probing every adventure card for that shape.
> · **Next:** the census below row ㉔ — Raid Bombardment, Crystal Barricade, Bartolomé / Hammerhead's sacrifice costs.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 23: "this spell costs {1} less to cast for each attacking creature [you control]" — Ancient Stone Idol, Static Snare, Embercleave · **+3** · corpus 14,877 (43.4%) / 34,245
> Suite **1614 files / 16,718 tests** green (1 skipped); lint 0. Flip-diff **+3, zero LOST, zero retiered** (tier snapshots at 3e914b43 → the
> change). **Mutants 5/5 killed on assertions** (restore byte-identical).
> · **Census row ㉒** (probed, not read off the examples column): "… for each attacking creature" sole-blocks Ancient Stone Idol
>   and Static Snare (Stone Idol Trap parks on its token line), and its sibling "… for each attacking creature you control"
>   sole-blocks Embercleave (EDHREC #1324). All three have Flash — which is why ③ · 22 came first: at sorcery speed nothing is
>   ever attacking, and this discount could never apply.
> · **Build:** the per-each self cost reduction (Karador's frame) reads the attacking count in its own arm — not in
>   parseSelfCountSource, which the P/T lane shares and whose board evaluator has no attacking count — and countForSpec
>   "attackingCreatures" counts the combat's live attackers: each still on the battlefield and not removed from combat
>   (CR 506.4); `youControl` keeps the caster's own for Embercleave. Outside combat the list is empty — the full cost.
>   legalChoices prices the cast off it when the action is offered, so the action carries the discounted cost it pays.
> · **Runtime (each offered by legalActionsForPlayer and paid for real):** no combat — seven floating cannot cast the {10} Idol
>   (the vacuity control) · `WITNESS idolWithThreeAttackers {"onBattlefield":true,"floatingLeft":0}` — the AI attacks with three,
>   the Idol costs {7} and takes exactly seven · two attackers leave it at {8} · an attacker removed from combat, or no longer on
>   the battlefield, is not counted · Static Snare against four attackers is cast for one white and exiles an attacking Bear ·
>   Embercleave costs {1}{R}{R} in the user's own three-creature attack and full price in the AI's.
> · **Mutants 5/5:** the arm removed · "you control" dropped at the parse · "you control" ignored by the count · a creature
>   removed from combat counted · an attacker off the battlefield counted. Witness
>   `app/src/lib/learn/attackingCreatureCostReduction.test.js` (7).
> · **Left for later:** Believe in the Cleave prints the name form ("<name> costs {1} less …"), which the self-cost reader
>   doesn't take — a separate normalization.
> · **Next:** the census below row ㉒ — Goblin Clearcutter / Orcish Lumberjack (multi-product mana, likely banked), then Murderous
>   Rider's dies-to-the-bottom.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 22: FLASH honoured at cast timing — 613 Flash cards, a documented under-delivery closed · runtime fix (+0) · corpus 14,874 (43.4%) / 34,245
> Suite **1613 files / 16,711 tests** green (1 skipped); lint 0. Flip-diff **0 / 0 / 0** — the classifier already credited Flash (tier snapshots
> at bd17fc92 → the change). **Mutants 3/3 killed on assertions** (restore byte-identical).
> · **Found while scoping census row ㉒** (Ancient Stone Idol, Static Snare, Embercleave — "costs {1} less to cast for each
>   attacking creature [you control]"): all three have Flash, and a probe showed a Flash creature is never offered outside the
>   caster's main phase — Ambush Viper was not castable in the AI's end step while Shock was. legalChoices.isSorcerySpeed read
>   the TYPE LINE alone ("Flash check is a v1.5 add — for now any non-instant defaults to sorcery"), and the cast builder's
>   comment claimed "a Flash card reads instant-speed via isSorcerySpeed already" — it did not. coverage.js documented the gap
>   ("strictly WEAKER than printed") while COVERED_KEYWORDS credited Flash anyway. With sorcery-speed casting nothing is ever
>   attacking, so row ㉒'s discount could never apply: crediting it first would have been a hollow credit.
> · **Build:** isSorcerySpeed also asks the card's own Flash, through the oracle-aware hasKeyword. The Scryfall keywords array and
>   the line-anchored scan agree on every one of the corpus's 613 Flash cards (0 disagreements), so no conditional or granted
>   flash text is read as the keyword. A GRANTED flash (Yeva, Vedalken Orrery) stays the separate flash-cast-permission path.
>   The stale comments in legalChoices, coverage.js and auraCoveredKeywordLine.test.js are updated.
> · **Runtime:** the AI's end step is a real instant window — Shock is offered and Grizzly Bears is not (the vacuity control) ·
>   `WITNESS flashViper {"turnOf":"ai","viperOnUserBattlefield":true,"handLeft":0}` — cast and resolved in the AI's end step ·
>   offered while the AI's attackers are declared (the ambush) · the AI's own Viper is offered to the AI in the user's end step ·
>   the user's main phase is unchanged.
> · **A test name GRADUATED:** sentinelsMark.test.js said the offer never cast the Aura outside its main-phase window ("Flash goes
>   unused"), so the Addendum's false branch was pinned at the reader only. It now runs through a REAL cast too:
>   `WITNESS sentinelsMarkFlashed` — flashed in during the user's combat or the AI's main phase, the host gets vigilance and no
>   lifelink.
> · **Mutants 3/3:** the Flash check removed (the old read) · every card read as instant-speed (red on the Bears control and
>   Yeva's pins) · the wrong keyword (Flashback). Witness `app/src/lib/learn/flashTiming.test.js` (5).
> · **For the play AI (Omnath's lane):** pickAction weighs casts uniformly and leaves timing to the offer side, so from this
>   commit the AI casts its Flash cards in the opponent's turn as well — trajectories from decks with Flash cards shift.
> · **Next:** ③ · 23 — census row ㉒ itself, now reachable.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 21: the OPTIONAL two-trigger detain folds — Fiend Hunter, Leonin Relic-Warder · **+2** · corpus 14,874 (43.4%) / 34,245
> Suite **1612 files / 16,705 tests** green (1 skipped); lint 0. Flip-diff **+2, zero LOST, zero retiered** (tier snapshots at e1c46d76 → the
> change). **Mutants 3/3 killed on assertions** (restore byte-identical).
> · **Census row ㉑** (the Wormfang Crab / Turtle row — its examples list carriers, not the blocked cards): "When this creature
>   leaves the battlefield, return the exiled card …" sole-blocks exactly Fiend Hunter and Leonin Relic-Warder, the two carriers
>   whose enters-exile is OPTIONAL. The four mandatory carriers (Faceless Butcher, Petravark, Slithery Stalker, Faceless
>   Devourer) were already native through triggers.foldTwoTriggerDetain (2026-08-05), which folds the older two-trigger
>   printing onto the one-sentence "until this creature leaves the battlefield" frame (CR 610.3).
> · **A guard lifted, on the rulings.** The fold refused a "you may" exile as "a different effect", with no ruling cited, and two
>   pins held it. The bundled rulings name how the two-trigger printing differs from the frame — the source leaving before its
>   enters-trigger resolves exiles the card forever (Oblivion Ring 2007-10-01, Leonin Relic-Warder 2011-06-01, Fiend Hunter
>   2018-12-07), where the frame exiles nothing (CR 610.3b), an under-delivery — and that holds for the MANDATORY carriers the
>   fold already claimed. None of it turns on the "you may".
> · **Build:** one refusal removed; the "you may" rides into the folded sentence, so the existing optional wrapper and the
>   detain link do the rest (Angel of Sanctions already ran that modern optional form). Both pins GRADUATED in place with notes:
>   twoTriggerDetainFold.test.js (the optional pair folds, keeping its "you may"; a new pin keeps a LONE optional exile
>   unfolded — still a permanent exile) and detainExile.test.js (Fiend Hunter native-trigger; the no-double-return guard is the
>   fold's exactly-one-trigger pin).
> · **Runtime (each through the trigger flush → the stack):** `WITNESS fiendHunterLoop {"aiBattlefield":["Grizzly Bears"],
>   "aiExile":[]}` — accepted, the AI's Bears are exiled and linked, and come back to the AI when Fiend Hunter dies · declined,
>   nothing is exiled or linked and Fiend Hunter leaving returns nothing · Leonin Relic-Warder exiles the AI's Mind Stone and,
>   bounced to hand, hands it back.
> · **Mutants 3/3:** the refusal restored · the leaves-clause kept (a second return) · the "you may" dropped by the fold (red on
>   the declined run). Witness `app/src/lib/learn/fiendHunterOptionalDetain.test.js` (4).
> · **Next:** the census below row ㉑.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 20: "if you would lose unspent mana, that mana becomes colorless instead" — Horizon Stone, Kruphix · **+2** · corpus 14,872 (43.4%) / 34,245
> Suite **1611 files / 16,700 tests** green (1 skipped); lint 0. Flip-diff **+2, zero LOST, zero retiered** (tier snapshots at 6be7df53 → the
> change). **Mutants 10/10 killed on assertions** (restore byte-identical).
> · **Census verdicts below row ⑲:** Blood Moon / Magus of the Moon — banked earlier (a mana-model change). Then **census row ⑳:**
>   Horizon Stone, Kruphix, God of Horizons.
> · **A wrong runtime, not only a missing parse.** Both cards sat in cardEffects' name-keyed registry as "keeps every colour" —
>   Kruphix's entry quoted a line the card never printed, and Horizon Stone's called itself an approximation. The classifier
>   never credited either, but a game with one on the battlefield carried COLOURED mana across steps: more than the printed
>   card, the forbidden direction. Both entries are retired.
> · **Build:** staticAbilityParser reads the exact line (`lostManaBecomesColorless`), and gameEngine.emptyManaPools — the single
>   CR 500.4 drain — keeps exactly the mana the player would lose, as {C}. What Omnath's green retention and the mana holds
>   keep is never lost, so it keeps its colour. A restricted entry (the QUARTET sub-pool) stays with its restriction and turns
>   colorless — both cards' bundled rulings — at a step end, and at cleanup, where its until-end-of-turn hold is dropped (the
>   static keeps it from then on). Controller-scoped: battlefields are keyed by controller, a phased-out permanent is spliced
>   out, and a face-down stand-in carries no line.
> · **Scope:** the colorless line only. "That mana becomes black / red instead" (Omnath, Locus of All; Ozai) could put two
>   differently coloured conversions under one player, and their CR 616.1 order is a choice — pinned as residue.
> · **Runtime:** floating {R}{R}{G} empties with no Stone (the vacuity control) · `WITNESS stoneDrain {…"C":3}` · the carried
>   {C}{C} casts Mind Stone in the second main phase, and without the Stone there is no cast · the {C} survives cleanup into the
>   next turn · Kruphix does the same while the AI's pool still empties · with Omnath the green stays green · the Stone gone,
>   the next drain loses the mana (the ruling) · a creature-only entry turns {C}{C} and still casts Myr Sire but not Mind Stone ·
>   an until-end-of-turn hold is untouched at a step end and turns colorless at cleanup instead of dropping.
> · **Mutants 10/10:** the arm pushing nothing · the arm broadened to any colour word · the drain never asking · the retired
>   approximation (every colour kept) · the kept green converted too · a restricted entry dropped · its restriction stripped ·
>   the cleanup dropping entries regardless · any player's Stone converting every pool · the hold flag kept. Witness
>   `app/src/lib/learn/lostManaBecomesColorless.test.js` (12).
> · **A stale pin GRADUATED with a note:** cardEffects.test.js's "Kruphix keeps every color" now pins the printed conversion.
> · **Next:** the census below row ⑳.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 19: "whenever a creature an opponent controls enters, you may have that player lose 1 life" · **+2** · corpus 14,870 (43.4%) / 34,245
> Suite **1610 files / 16,688 tests** green (1 skipped); lint 0. Flip-diff **+2, zero LOST, zero retiered** (tier snapshots at b7c95da7 → the
> change). **Mutants 4/4 killed on assertions** (restore byte-identical).
> · **Census row ⑲:** Blood Seeker, Suture Priest. The trigger was already detected (an ETB watcher scoped
>   creatureOpponentControls); its payoff never parsed, because "that player" — the entering creature's controller — had no
>   referent.
> · **Build:** detectTriggers rewrites "you may have that player lose N life", gated to that event and scope and anchored to the
>   whole clause, to the "triggering permanent's controller" sentinel the its-controller payoffs already use (bound in
>   makePendingTrigger's context); a life arm reads the causative "have … lose N life". The optional wrapper keeps the "you may"
>   a real choice.
> · **An honest note on the gate:** no corpus card can reach it ungated — every event that names a player (upkeep, graveyard,
>   cast, draw, damage) binds its own "that player" before this rewrite runs; a synthetic cast-drain probe proved it. The gate
>   is kept narrow as the safe direction, and it is NOT counted as mutation-checked.
> · **Runtime (each through checkEnterTriggers → the stack):** the user's own Bears entering fire nothing (the vacuity control) ·
>   `WITNESS seekerDrain {"user":0,"ai":-1}` when the AI's Bears enter · declining the "you may" leaves the AI's life alone ·
>   Suture Priest gains 1 off the user's creature and drains 1 off the AI's · the AI's Blood Seeker costs the user 1.
> · **Mutants 4/4:** the rewrite removed · the causative arm removed · the wrong referent (the Seeker's own controller) · the
>   "you may" dropped. Witness `app/src/lib/learn/opponentCreatureEntersDrain.test.js` (6).
> · **Next:** the census below row ⑲.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 18: "exile it instead" at EVERY death site + the opponent-creature static · **+2** · corpus 14,868 (43.4%) / 34,245
> Suite **1609 files / 16,683 tests** green (1 skipped); lint 0. Flip-diff **+2, zero LOST, zero retiered** (tier snapshots at 54c620e8 → the
> change). **Mutants 9/9 killed on assertions** (restore byte-identical).
> · **Census row ⑱:** "If a creature an opponent controls would die, exile it instead." — Stone of Erech, Misery's Shadow (Vren,
>   Gisa, Liesa, Nemata, Corpseweaver Prodigy, Garruk, Veiled Butcher carry it and park on other gaps).
> · **The real fix is the death sites, not the card.** Exile-instead was asked at only TWO of the four places a creature dies —
>   lethal damage / 0 toughness and the legend rule — so Lava Coil's rider and ③ · 8's damage-source static silently failed
>   when the creature was DESTROYED or SACRIFICED instead (③ · 8 shipped that as a documented under-application). **Build:** one
>   predicate, `gameState.diesExiledInstead(state, perm)` — Lava Coil's this-turn stamp, the damage-source static, and the new
>   opponent-creature static (`exileOpponentCreaturesOnDeath`, scoped to a creature controlled by an OPPONENT of the static's
>   controller) — asked of the pre-removal state by all four sites: destroyLethalCreatures, applyLegendRule,
>   spellEffects.applyDestroyEffect, removal.sacrificeCreatureEffect. An exiled creature never died (CR 614): its look-back
>   carries exileInstead, so dies triggers stay quiet; a sacrificed-and-exiled creature was still sacrificed (sacrifice
>   triggers fire). ③ · 8's under-application note is retired; a fight recording no damage source is the one left.
> · **Runtime:** Murder on the AI's Grizzly Bears — graveyard with no replacement (the vacuity control), `WITNESS stoneMurder
>   exile` under the user's Stone of Erech, graveyard for the user's OWN Bears · Doomed Traveler exiled by Murder under Misery's
>   Shadow makes no Spirit (the unreplaced run does) · Lava Coil's stamp and Kumano's Pupils' damage now hold at the destroy
>   site · a sacrifice, a Lightning Bolt kill and the legend rule each exile under the static.
> · **Mutants 9/9:** the static arm · the opponent scope dropped (red on the user's own Bears) · the destroy site never asking ·
>   the destroy site's look-back saying it died (red on Doomed Traveler's Spirit) · the sacrifice site never asking · the
>   lethal and legend sites reverted to the old two sources · the predicate dropping Lava Coil's stamp · dropping the damage
>   source. Witness `app/src/lib/learn/diesExiledInstead.test.js` (10), with exileWhatItDamaged and damageExileReplacement.
> · **Next:** the census below row ⑱.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 17: "sacrifice it unless it escaped" — Phlage, Uro · **+2** · corpus 14,866 (43.4%) / 34,245
> Suite **1608 files / 16,673 tests** green (1 skipped); lint 0. Flip-diff **+2, zero LOST, zero retiered** (tier snapshots at e5f78f95 → the
> change). **Mutants 4/4 killed on assertions** (restore byte-identical).
> · **Census row ⑰** (a 2-sole row, chosen for its cards): Phlage, Titan of Fire's Fury and Uro, Titan of Nature's Wrath. Kroxa
>   carries the line but parks on its discard/lose-life payoff.
> · **Build:** the existing self-sacrifice atom with an `unlessEscaped` flag; `applySacrifice` skips a permanent that carries
>   `escaped`. **The engine never offers an escape cast** (coverage's ESCAPE_LINE note), so today no permanent carries it and a
>   titan cast from the hand is always sacrificed after its "enters or attacks" trigger does its work — exactly the printed
>   outcome, not an approximation. The flag is the contract a future escape cast must stamp, and a pin holds it.
> · **Runtime (each cast for real):** `WITNESS phlageCast {"phlageInGraveyard":true,"onBattlefield":false,"lifeGained":3,
>   "aiDamage":3}` · Uro gains 3, draws, and is sacrificed · a Phlage carrying `escaped` stays on the battlefield and still deals
>   its 3.
> · **Mutants 4/4:** the arm removed · the flag never set · the resolver ignoring it · inverted (sacrificed only when escaped —
>   red on both casts). Witness `app/src/lib/learn/sacrificeUnlessEscaped.test.js` (5).
> · **Next:** the census below row ⑰.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 16: "when ~ is put into a graveyard from anywhere" — the Eldrazi titans · **+5** (3 unplanned, each run for real) · corpus 14,864 (43.4%) / 34,245 · **Omnath, Locus of Mana 94 → 95 (Kozilek)**
> Suite **1607 files / 16,668 tests** green (1 skipped); lint 0; decks 88% (2,651 / 2,998 — Kozilek is in Colton's Omnath
> list). Flip-diff **+5, zero LOST, zero retiered** (tier snapshots at cddfbe9f → the
> change). **Mutants 7/7 killed on assertions** (restore byte-identical).
> · **Census verdicts below row ⑮ (the re-run list):** "becomes the colour of your choice" (Rainbow Crow, Wild Mongrel, Tidal
>   Visionary …) — **BANKED**, a choice class like the plan's "tap or untap" / "basic land type of your choice" rows: it needs
>   a human colour picker and an AI policy, and inventing a colour is not an option. Then this 2-sole row, chosen for its cards.
> · **Census row ⑯:** Kozilek, Butcher of Truth and Ulamog, the Infinite Gyre (planned; Emrakul carries the line but parks on
>   another gap) + **three unplanned, each run for real:** Worldspine Wurm ("… shuffle it into its owner's library"), Feldon's
>   Cane ("{T}, Exile this artifact: Shuffle your graveyard into your library."), Archangel's Light (2 life per card, then the
>   shuffle).
> · **Build — a SELF graveyard-arrival event, from any zone.** `triggers.js` detects "<self> is put into a graveyard from
>   anywhere" as `gyEnterSelf`, the subject resolved against "this creature/card", the full name, the legendary short name
>   ("Kozilek") and the first word — the becomes-monstrous self arm's resolution; any other subject stays undetected.
>   `checkGraveyardEventTriggers` (the per-card graveyard-event queue every graveyard write already records) fires the MOVED
>   card's own trigger, sourced from the card in the graveyard and controlled by its OWNER (CR 113.8). The payoff: "its owner
>   shuffles their graveyard into their library" is rewritten (event-gated) to "shuffle your graveyard into your library", now a
>   plain clause for the existing shuffle-graveyard atom (until today reachable only from Finale of Revelation's template).
> · **The audit caught a hollow credit before commit.** Worldspine Wurm flipped native through the same event, but its payoff —
>   "shuffle IT into its owner's library" — never moved the card: the self-fire passed no triggering object, so the self-tuck
>   resolver had no referent. The fire now names the card as its own triggering object (the self-dies convention the resolver
>   already reads), and the pre-fix form is a pinned mutant.
> · **Runtime:** `WITNESS milledKozilek {"graveyard":0,"library":6,"kozilekIn":"library"}` · discarded and dies, the same · a
>   Kozilek stolen from the AI dies into the AI's graveyard and the AI's graveyard shuffles (the user's stays) · another card
>   hitting the graveyard shuffles nothing · Ulamog milled · Grizzly Bears milled (the vacuity control) keeps the graveyard ·
>   `WITNESS worldspineDies tokens 3 · inLibrary true · graveyard ["Old Card 0"]` (both its triggers; only the Wurm goes back) ·
>   Feldon's Cane activated · Archangel's Light gains 6 for three cards, then shuffles.
> · **Mutants 7/7:** the self arm removed · any subject read as self · the self-fire dead · no triggering object (the pre-audit
>   form — red on both Worldspine runs) · controlled by the active player instead of the owner · the owner rewrite removed · the
>   plain clause removed. Witness `app/src/lib/learn/eldraziGraveyardShuffle.test.js` (14).
> · **Documented under-application:** a token never records a graveyard event (a token is not a card, CR 111.1), so a token
>   copy of a titan doesn't trigger it.
> · **Two stale pins GRADUATED with a note** (the first full suite was red on exactly these two): annihilator.test.js's
>   "Kozilek-style stays body-only" (the park intent is still pinned by Pathrazer and the Ulamog-style case) and
>   selfCastTrigger.test.js's parked Kozilek entry (Jeskai Baller keeps that pin's intent).
> · **Next:** the census below row ⑯.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 15: "search your library for ANY NUMBER of cards named ~" · **+3** · corpus 14,859 (43.4%) / 34,245
> Suite **1606 files / 16,655 tests** green (1 skipped); lint 0. Flip-diff **+3, zero LOST, zero retiered** (tier snapshots at 58ea483f → the
> change). **Mutants 4/4 killed on assertions** (restore byte-identical).
> · **Census row ⑮:** Legion Conquistador, Gathering Throng, Battalion Foot Soldier — the Squadron Hawk shape ("up to three
>   cards named ~", native since 2026-08-05) with an unbounded count.
> · **Parked on purpose until now, and the reason still stands.** The plural named tutor refused "any number" because its
>   `remaining` cap could only be a literal, and four — the obvious guess — silently under-fetches the Relentless Rats / Persistent
>   Petitioners decks the wording exists for. **Build — the wire that can say "all":** the atom carries `anyNumber`, and the
>   tutor resolver sets the cap to the matching candidates the library holds at resolution (read from the state, never
>   guessed; `Infinity` was out because state is serialized and JSON writes it as null). The old "stays parked" pin is
>   GRADUATED in place with a note.
> · **Runtime:** `WITNESS {"offered":[5,4,3,2,1],"hand":5,"library":["plains"]}` — five Conquistadors (one more than the
>   guess would have allowed), each pick offering only the ones left, the Plains untouched · "any number" includes fewer:
>   declining after two picks leaves three · Squadron Hawk still stops at three (its witness unchanged).
> · **Mutants 4/4:** the "any number of" alternation removed · the cap as one pick · **the cap as the old guess, 4 (red on
>   the five-copy drive)** · the flag never set. Witness `app/src/lib/learn/pluralNamedTutor.test.js` (5).
> · **Next:** the census below row ⑮.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 14: the Clockwork cycle — "remove a +1/+1 counter from it at end of combat" · **+4** · corpus 14,856 (43.4%) / 34,245
> Suite **1606 files / 16,653 tests** green (1 skipped); lint 0. Flip-diff **+4, zero LOST, zero retiered** (tier snapshots at 2e81ea43 → the
> change). **Mutants 5/5 killed on assertions** (restore byte-identical).
> · **The census, re-run (2026-09-30 ~06:55Z, against 2e81ea43):** 19,449 non-native · 10,560 sole-blocker cards; the built
>   rows gone. The defect reports read first, per the runbook: every bug signature left is a single card with its own root
>   cause (the "sacrifice an artifact" one sole-blocks Reshape, not Tinker — the example list mixes carriers). The top
>   ranked row with existing machinery was this one.
> · **Census row ⑭:** Clockwork Beetle, Condor, Vorrac, Dragon — "Whenever this creature attacks or blocks, remove a +1/+1
>   counter from it at end of combat."
> · **Build — a third action on the ④-AX self end-of-combat queue** (Mardu Blazebringer's sacrifice, Windscouter's return).
>   The clause → `self-at-end-of-combat` action `remove-counter`; the resolver enqueues a turn-stamped entry; the
>   end-of-combat drain removes the counter through `removeCounter` and then runs the lethal check with its dies look-back
>   (the pair combat damage already runs), so a Clockwork left at 0/0 dies before anyone gets priority (CR 704.5f). A
>   "no counter left → skip" guard was dropped before commit: `removeCounter` already changes nothing at zero, so no test
>   could ever tell it was there.
> · **Runtime (each through checkAttackTriggers / checkBlockTriggers → the stack → resolveCombatDamage):** `WITNESS beetleAttack
>   damage 2 · counters 2 → 1` (the counter waits for end of combat) · a Beetle on its last counter hits for 1, then dies at
>   0/0 · the Dragon 6 → 5 · the Condor blocking a 1/1 ends on 2 · **blocking Gray Ogre it takes 2, shrinks to 2/2 at end of
>   combat with the damage still marked, and dies (CR 704.5g)** — the test first expected it to survive; the engine was right.
> · **Mutants 5/5:** the clause arm · the drain ignoring the entry · no lethal check after the removal · the counter off at
>   once instead of at end of combat · two counters. (The at-once mutant's first form called a helper removal.js doesn't
>   import, so some of its reds were errors; rewritten as plain state edits, its reds are assertions.) Witness
>   `app/src/lib/learn/clockworkEndOfCombat.test.js` (6).
> · **Next:** the census below row ⑭.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 13: "target creature blocks this creature this turn if able" · **+7** · corpus 14,852 (43.4%) / 34,245
> Suite **1605 files / 16,647 tests** green (1 skipped); lint 0. Flip-diff **+7, zero LOST, zero retiered** (tier snapshots at 74c63a70 → the
> change). **Mutants 8/8 killed on assertions** (restore byte-identical).
> · **Census row ⑬:** Trumpeting Armodon, Matsu-Tribe Decoy, Tangle Angler, Rampant Elephant, Burning-Tree Bloodscale, Maraleaf
>   Rider (a Food as the cost), Lurking Arynx (formidable) — every one activated for real. Vortex Elemental and Torchling stay
>   parked on other abilities.
> · **Build — the requirement twin of the pairwise "can't block this creature" (CR 509.1c).** The clause arm → op
>   `must-block-source`; the atom grants the same source-keyed endOfTurn layer-6 keyword (`mustBlockSource:<sourceId>`) — both
>   atoms now share one body, `grantSourcePairKeyword`; the target intent is enemy-side. `opponentAI.pickBlockers` seeds the
>   forced pair FIRST whenever it is a legal block. Same house bar as LURE and MUST-ATTACK: the AI seat complies; the human seat
>   is never hard-gated.
> · **Menace, by the rule rather than a skip.** The first draft skipped a menace attacker, and its mutant SURVIVED: the engine
>   never offers a lone blocker against menace, so that pin couldn't reach the skip. CR 509.1c asks for the most requirements
>   obeyed without breaking a restriction, so the forced blocker now brings the fewest helpers that make the block legal —
>   smallest power, then id, the MUST-BE-BLOCKED recruiting order — and nothing is seeded when the block can't be completed (a
>   helper bound by its own requirement elsewhere). Both cases are pinned; the unkillable skip is gone.
> · **Runtime:** unforced, the AI's Grizzly Bears don't chump a 3/3 (the vacuity control) · `WITNESS forcedBlock ["b→arm"]` after
>   the {1}{G} activation · with Craw Wurm also attacking (its id sorting first), the Bears still block the Armodon · menace:
>   Bears + Llanowar Elves (not the Wurm), none unforced, none when the Elves are bound elsewhere · the four other carriers each
>   grant the requirement · Lurking Arynx only at total power 8+ · Maraleaf Rider pays with a Food and isn't offered without one.
> · **Mutants 8/8:** the clause arm · the seeding dead · forced toward ANY attacker (red on the reordered pin) · no helper
>   recruited · the completeness guard removed · helpers largest-first · the grant not source-keyed · the intent flipped. Witness
>   `app/src/lib/learn/mustBlockSource.test.js` (10).
> · **Next:** the census below row ⑬.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 12: "cast this spell only if you've cast another spell this turn" · **+3** · corpus 14,845 (43.3%) / 34,245
> Suite **1604 files / 16,637 tests** green (1 skipped); lint 0. Flip-diff **+3, zero LOST, zero retiered** (tier snapshots at 988b43bb → the
> change). **Mutants 5/5 killed** (restore byte-identical) — see the LOADFAIL note below.
> · **Census row ⑫:** Illusory Angel, Skyshroud Condor, Hewed Stone Retainers — each sole-blocked by the sentence.
> · **Build — the declare-attackers restriction's twin (CR 601.3).** ONE pattern in textNormalize
>   (`CAST_ONLY_AFTER_ANOTHER_SPELL_PATTERN`, a zero-import leaf) feeds the detector (`abilities.castOnlyAfterAnotherSpell`)
>   and the strip; legalChoices' single cast-offer chokepoint refuses the card until the caster's `spellsCastThisTurn` (bumped
>   at the cast chokepoint, reset at untap) is at least 1; `coverage.isKeywordOnly` strips the sentence, because every carrier
>   is a creature that never reaches the spell parser. The whole sentence is anchored: "two or more spells" stays residue.
> · **Runtime:** the same Angel without the sentence is offered on a quiet turn (the vacuity control) · none of the three is
>   offered before a spell has been cast · `WITNESS angelAfterOpt offeredBefore=false · offeredAfter=true · onBattlefield=true`
>   (cast Opt for real, then the Angel is offered and resolves) · a spell cast earlier this turn opens the gate for all three.
> · **Mutants 5/5:** the gate removed · the gate needing two spells · the classifier strip removed · the pattern accepting
>   another count (red on the synthetic "two or more" guard) · the detector dead. Witness
>   `app/src/lib/learn/castOnlyAfterAnotherSpell.test.js` (6).
> · **LOADFAIL is not a kill (a mutation-runner fix).** The strip mutant's first form was a syntax error; the scratch runner
>   counted `failed || fileFails` and printed "KILLED — 0 red". Rewritten as an identity call it goes red on the classification
>   pin. The runner now prints LOADFAIL and counts assertion reds only; ③ · 8's five mutants were re-run under it and all five
>   still go red on assertions (③ · 9–⑪ had shown at least one assertion red per mutant). Banked in the hollow-gate law.
> · **Next:** census row ⑬ — "{2}: target creature blocks this creature this turn if able" (Trumpeting Armodon,
>   Matsu-Tribe Decoy).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 11: the void condition — "if a nonland permanent left the battlefield this turn or a spell was warped this turn" · **+6** · corpus 14,842 (43.3%) / 34,245
> Suite **1603 files / 16,631 tests** green (1 skipped); lint 0. Flip-diff **+6, zero LOST, zero retiered** (tier snapshots at 571a6cb8 → the
> change). **Mutants 7/7 killed** (restore byte-identical).
> · **Census row ⑪:** Insatiable Skittermaw, Kavaron Skywarden, Interceptor Mechan (+1/+1 counter at end step), Voidforged Titan
>   (draw and lose 1), Elegy Acolyte (a 2/2 Robot) and Decode Transmissions (the spell's "instead") — every one run for real.
>   Not flipped, each with its own gap: Hylderblade (attach at end step), Plasma Bolt / Tragic Trajectory / Hymn of the Faller
>   ("instead" shapes the spell lane doesn't parse), Roving Actuator (copy-cast), Axavar (heist), Chorale, Alpharael.
> · **The condition had no reader** — Temporal Intervention was native only because its void cost reduction is ignored (it pays
>   full price: the under-application side). **Build:** a GLOBAL turn stamp, `nonlandLeftBattlefieldTurn`, written at the top
>   of `gameState.moveCardToZone` — the one battlefield exit — before any replacement, so a shuffle-instead or a blink still
>   records it; any player's permanent, a token included; land-ness read layer-aware as the permanent last existed. An
>   interveningIf arm compares it to the live turn (no reset). The warp half is exactly false, not an under-read: the engine never
>   offers a warp cast. "Void —" was already a stripped ability word, so the triggers and the spell's rider parsed once the
>   condition could be read.
> · **Runtime:** the tracker — nothing gone → false (the vacuity control) · a creature leaving → true · a LAND leaving → false · an
>   opponent's artifact bounced → true · a token dying → true · a creature made a land by a fixed layer-4 add → false · next turn
>   → false. The cards — `WITNESS voidCounters [1,1,1]` after Grizzly Bears leave (none on a quiet turn) · Voidforged Titan draws
>   and loses 1 only when it holds · Elegy Acolyte's 2/2 Robot (none on a quiet turn) · `WITNESS decodeInstead hand 2 · lives
>   [40,38,38,38]` (the quiet cast: you lose the 2).
> · **Mutants 7/7:** the stamp dead · a land counting · a printed-type land read (red on the layer-4 pin) · tokens excluded · the
>   turn ignored · the reader removed · controller-scoped (red on the opponent's artifact). Witness
>   `app/src/lib/learn/voidCondition.test.js` (12).
> · **Next:** census row ⑫ — "cast this spell only if you've cast another spell this turn" (Illusory Angel, Hewed Stone
>   Retainers).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 10: the life floor — "damage that would reduce your life total to less than 1 reduces it to 1 instead" · **+4** · corpus 14,836 (43.3%) / 34,245
> Suite **1602 files / 16,619 tests** green (1 skipped); lint 0. Flip-diff **+4, zero LOST, zero retiered** (tier snapshots at 253172a5 → the
> change). **Mutants 10/10 killed** (restore byte-identical).
> · **Census row ⑩:** Ali from Cairo, Sustaining Spirit, Fortune Thief, and Worship's "If you control a creature, …" — each
>   sole-blocked by the line. No machinery existed (all eight carriers were parked, Worship included). Elderscale Wurm ("as long
>   as you have 7 or more life … less than 7"), Angel of Grace, Angel's Grace and Serra's emblem stay where they were.
> · **Build — a replacement at the one life-loss chokepoint.** The static parser emits a coverage marker (`lifeFloor`, plus
>   `ifControlCreature` for Worship) read by `lifeFloorOf`; `gameState.loseLife` asks `lifeFloorFor` of the loser's own battlefield
>   (battlefields are keyed by controller) for a DAMAGE loss only — the existing `combatDamage` discriminator, which both damage
>   callers pass and nothing else does. The damage stays whole (CR 120.3a): `damageTakenThisTurn` keeps it, and lifelink and
>   commander damage are tallied by the callers from the damage dealt. What changes is the life LOST, and that is what
>   `lifeLostThisTurn`, the life-loss watcher and the speed bump now see (identical to before for every unfloored loss). A
>   `life-floor` event is logged when it bites. Worship's creature is asked at that moment through the layer-aware creature
>   read; a face-down permanent's card is its 2/2 stand-in, so a face-down Fortune Thief sets no floor (CR 708.2).
> · **Settled by the printed rulings (bundled rulings.json), not by instinct — and one first draft was wrong.** The floor
>   applies only to damage (a drain or a pay-life cost goes below 1), and it gives a player already at 0 or less no help at all
>   (Sustaining Spirit: "Does not affect damage if you are already at zero or negative life. You still take it all."). My first
>   formula held a total already below 1 where it was; the ruling says the damage lands in full, and the pin now says so. Ali's
>   ruling — a floor that dies in the same damage event still applies — holds because combat deals player damage before the
>   lethal-damage check.
> · **Runtime:** `WITNESS aliBolt life 1 · damage 3 · lost 2` (Lightning Bolt at 3 life; the vacuity control goes to 0) · Craw
>   Wurm into 2 life → 1 · `WITNESS lifelinkIntoFloor ai 1 · user 22` (Vampire Nighthawk's lifelink gains the full 2) · Ali blocks
>   and dies in the same step → 1 · `WITNESS exquisiteBloodSeesLoss ai 1 · user 22` (it gains the 2 lost, not the 3 dealt) · no
>   speed at 1 life · Worship with Grizzly Bears → 1, alone → 0 · the user's Ali doesn't save the AI · face-down Fortune Thief →
>   0, face up → 1 · a non-damage loss → −1 · at 0 life → −2.
> · **Documented under-application:** a pain land's "deals 1 damage to you" reaches loseLife unmarked (no `combatDamage`), so
>   it is not floored. Marking it would also move the win-con attribution and bloodthirst's damage ledger — its own slice.
> · **Mutants 10/10:** the arm dead · Worship's condition unparsed · the creature condition unchecked · every loss floored ·
>   the floor helping a player below 1 · the ledger counting damage · any player's floor protecting you · a face-down reading its
>   real card · the watcher seeing the damage · the speed bump on no loss. Witness `app/src/lib/learn/lifeFloor.test.js` (14).
> · **Next:** census row ⑪ — the "void —" end-step trigger (Insatiable Skittermaw, Kavaron Skywarden).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 9: "as long as equipped creature is a Human, it gets an additional +N/+N" — and its family · **+8** (5 unplanned, each run for real) · corpus 14,832 (43.3%) / 34,245 · + a Mistform type-read FP closed
> Suite **1601 files / 16,605 tests** green (1 skipped); lint 0. Flip-diff **+8, zero LOST, zero retiered** (tier snapshots at dfa7336d → the
> change; the Mistform fix alone is ±0). **Mutants 12/12 killed** (restore byte-identical).
> · **Census row ⑨:** True-Faith Censer, Silver-Inlaid Dagger, Heavy Mattock (planned +3) + **the same condition on five more,
>   unplanned: Sharpened Pitchfork ("… it gets +1/+1"), Butcher's Cleaver ("… it has lifelink"), Bladed Bracers ("… is a Human
>   or an Angel, it has vigilance") and the Aura twins Hope Against Hope / Equestrian Skill ("As long as enchanted creature is a
>   Human, it has first strike / trample")** — every one of the eight driven on a board in the witness.
> · **Build — a fourth attached-bonus condition kind, `hostHasSubtype`.** The parser arm (parseAttachedBonus, both subjects) strips
>   the condition, runs the rest through the existing attached-clause parser, and gates what comes back: P/T swaps to the gated
>   twin `ptModifyGated` (a gate stamped on plain `ptModify` is ignored — the bonus would reach every host), a keyword takes the
>   gate directly, anything else refuses the whole bonus. Every named word must be a CR creature type (the closed
>   `CR_CREATURE_TYPES` vocabulary), so "is legendary", "is attacking" and the colour conditions stay residue. "An additional"
>   is only the printed contrast with the unconditional line above it. The Aura residue check vouches the line the way it
>   vouches the other gated shapes (a non-empty all-or-nothing bonus).
> · **The read — one for both halves, and never the derive.** `layers.gateMet` reads the HOST through Changeling (CR 702.73a) +
>   `effectiveTypeIdentity` — the recursion-free, layer-aware type read a tribal lord's subtype filter already makes. The P/T form
>   is evaluated inside the derive (the layer-7 applier) and the keyword form outside it (`permanentHasKeyword`) and inside it
>   (the keyword set); a derive-based read would re-enter from the first and fork from the second. `WITNESS mistformBecomesHuman
>   3/2 → 4/2 (Human)`: a Mistform Dreamer wearing the Censer activates its own {1}, becomes a Human, and the bonus follows.
>   Why the shared read can be trusted: every native type-REPLACING effect is a self-only Mistform/Proteus ability on a
>   non-Human, and all twelve "loses all abilities and is a … creature" transformations (Frogify, Kenrith's Transformation, Oko
>   …) are parked — so no modeled effect strips Human from a printed Human. One way remained to strip an ADDED Human, and it is
>   the fix below. Documented under-read: a type added by a SELF or dynamic layer-4 effect (Metallic Mimic's chosen type) isn't
>   in that read — the host goes without the bonus.
> · **Runtime:** `WITNESS censerOnHuman 4/2 · onBear 3/3` (the vacuity control) · Dagger 5/1 vs 4/2 · Mattock 4/3 vs 3/3 ·
>   Pitchfork 3/2 vs 2/2 (first strike either way) · a Changeling gets it · Cleaver lifelink on the Human only (both readers
>   agree) · Bracers vigilance on a Human AND an Angel, not a Bear · the Auras' first strike / trample on a Human only.
> · **FIXED IN THE SLICE — the Mistform type read (a pre-existing FP, and one this gate would have inherited).** Two halves:
>   ① `effectiveTypeIdentity` only ever ADDED a Mistform choice and never removed the creature type it `replaces`, so an
>   Illusion lord kept pumping a Dreamer that had become something else — `WITNESS lordStopsAtHuman 3/2 hexproof → 2/1 no
>   hexproof` (Lord of the Unreal, native-static, live before this); it now mirrors the derive's replacement. ② The atom
>   snapshotted `replaces` from the PRINTED line, so a second activation left the first choice standing in BOTH reads (CR 613.7:
>   the later choice is applied after, and replaces the creature types — CR 205.1a); it now snapshots the derive's CURRENT
>   creature types, filtered to CR creature types so an artifact/land subtype is never replaced (the old printed read would have
>   replaced one). `WITNESS secondChoice Human 4/2 → Bear 3/2` — the Censer's Human bonus leaves when the Dreamer, with two Bears
>   now on the board, becomes a Bear. **I first logged this as not reachable by the gate; it was, through exactly that second
>   activation — which is why it was fixed here rather than queued.** ±0 tiers (flip-diff of the fix alone: 0 / 0 / 0).
> · **Mutants 12/12:** the arm dead · the vocabulary check dropped (red on the synthetic "is a Food" guard) · the gate stamped on
>   plain ptModify · the gate always open · Changeling ignored · printed-only read (red on the Mistform runs) · the Aura vouch
>   removed · only the first named type (red on the Angel) · "an additional" not stripped · the shared read never removes what a
>   choice replaces · a choice replaces only the printed types · the creature-type filter dropped (red on a synthetic "Artifact
>   Creature — Food Illusion" losing Food). Witness `app/src/lib/learn/hostSubtypeAttachedBonus.test.js` (16).
> · **Next:** census row ⑩.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 8: "if a creature dealt damage by this creature this turn would die, exile it instead" · **+4** (1 unplanned, run for real) · corpus 14,824 (43.3%) / 34,245
> Suite **1600 files / 16,589 tests** green (1 skipped); lint 0. Flip-diff **+4, zero LOST, zero retiered** (tier snapshots at 91e5e3dd → the
> change). **Mutants 5/5 killed** (restore byte-identical).
> · **Census row ⑧:** Incendiary Oracle, Kumano's Pupils, Frostwielder (planned +3) + **Kumano, Master Yamabushi (unplanned —
>   its static names itself, "dealt damage by Kumano", and the parser's self-name normalization reads it; its runtime is pinned:
>   `WITNESS kumanoPing {"exile":true,…}`)**.
> · **Machinery:** the per-permanent `damagedBy` record (combat pairs via recordDamageSource; "deals N damage" effects) and
>   the death-to-exile path Lava Coil's `exileIfDiesTurn` stamp rides (the lethal-damage and legend-rule death sites).
> · **Asked at DEATH, not stamped at damage — the whole correctness of it.** The line is a replacement from a STATIC ability
>   (CR 614), so it applies only while its source is on the battlefield. A stamp at damage time would still exile after the
>   source left; instead `gameState.damagedByExilingSource` asks, of the pre-removal state at the moment of death, whether a
>   permanent in the dying creature's damagedBy is on the battlefield carrying the static (a source dying in the same event
>   is still there immediately before). The static parser emits `exileDamagedOnDeath`; `exilesCreaturesItDamaged` reads the
>   same parse for the classifier and the death path.
> · **Runtime:** `WITNESS frostwielderPing {"exile":true,…}` (a plain pinger's control goes to the graveyard) · `WITNESS
>   pupilsCombat {"exile":true,…}` (a blocker, through resolveCombatDamage) · the SAME damaged creature exiled while the source
>   is present and put in the GRAVEYARD once it has left · the legend-rule death site asks too (CR 700.4) · a creature the
>   source never damaged dies normally.
> · **Documented under-application (the safe side, shared with Lava Coil's rider):** only the lethal-damage and legend-rule
>   death sites honor death-to-exile, so a creature damaged by the source and then destroyed or sacrificed that turn goes to
>   the graveyard; a fight records no damage source.
> · **Mutants 5/5:** the static arm · the lethal-damage site · the legend-rule site · a stamp's semantics (the source need
>   not be present — red on the "has left" pin) · the detector dead. Witness `app/src/lib/learn/exileWhatItDamaged.test.js` (8).
> · **Next:** census row ⑨ — True-Faith Censer / Silver-Inlaid Dagger's "as long as equipped creature is a Human, it gets an
>   additional +N/+N".

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 7: "sacrifice it unless you discard a card AT RANDOM" · **+3** · corpus 14,820 (43.3%) / 34,245 · + two "Pay {0}" UI lies fixed
> Suite **1599 files / 16,580 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,650 / 2,998). Flip-diff **+3, zero LOST, zero retiered** (tier snapshots at 3ce27bfe → the
> change). **Mutants 6/6 killed** (restore byte-identical).
> · **Census row ⑦:** "When this creature enters, sacrifice it unless you discard a card at random." — Minotaur Explorer,
>   Pillaging Horde, Balduvian Horde. Predicted +3, measured +3.
> · **Both halves were machinery:** the sac-unless-pay pause (echo, cumulative upkeep, the Masticore cycle's "unless you
>   discard a card") and the random-discard cost kind Apathy's optional payment settles through the seeded
>   pitchRandomDiscard (CR 701.9b). Three arms, each one a lesson a past slice paid for: the matcher's "( at random)?"; the
>   SETTLE's own discard-random branch (a real random discard; an empty hand pays nothing → sacrificed); and the AUTO-PICK's
>   own branch — without it the kind falls through to canAfford(…, {}), which is TRUE for an empty mana cost, so the AI
>   would say "pay" with an empty hand (the Masticore lesson written into autoPickSacUnlessPay).
> · **Two UI lies found while scoping, fixed:** the shared wardCostLabel had no arm for `discard-random` or `energy`, so
>   both fell to its numeric fallback and read "Pay {0}" — Apathy's optional-payment prompt and every energy-cost prompt
>   (the function's own comment: "Never let a new cost kind fall to the numeric fallback: it renders a lie."). Now
>   "Discard a card at random" and "Pay {E}…".
> · **Runtime:** `WITNESS explorerPaid {"onBoard":true,"hand":2,"discarded":["A"]}` · decline → sacrificed, hand untouched ·
>   an empty hand → the AI declines and even a "pay" sacrifices · the pick is seeded (same state → same card).
> · **Mutants 6/6:** "at random" unrecognized · read as a chosen discard · the settle's arm · the auto-pick's arm · the
>   random-discard label · the energy label. Witness `app/src/lib/learn/sacUnlessDiscardRandom.test.js` (8) + three pins in
>   PendingChoicePanels.test.jsx.
> · **Next:** census row ⑧ — Incendiary Oracle / Kumano's Pupils' "if a creature dealt damage by this creature this turn
>   would die, exile it instead".

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 6: sacrifice LANDS (or a creature) rather than pay — Fireblast and six more · **+7** · corpus 14,817 (43.3%) / 34,245
> Suite **1598 files / 16,569 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,650 / 2,998). CI green on the two
> commits before it (run 36671363402 — 9440d097, which also covers c5d63bfd, whose own run concurrency cancelled). Flip-diff **+7, zero LOST, zero retiered, no unplanned gain** (tier snapshots at
> 9440d097 → the change). **Mutants 12/12 killed** (restore byte-identical).
> · **Census row ⑥:** "[If it's your turn, ]you may sacrifice a Mountain / two Mountains rather than pay this spell's mana
>   cost" — Thunderclap, Crash, Mine Collapse, Fireblast, Mogg Alarm, Pulverize — plus Dark Triumph's "If you control a
>   Swamp, you may sacrifice a creature …". Predicted +7, measured +7.
> · **Machinery:** the alternative-cost lane (the Flare cycle's creature sacrifice, Gush's return-lands, ② · 1's tap).
>   A new kind `sacrificeLands` whose offer is ONE canonical land set on Gush's documented reasoning — same-subtype lands
>   are near-fungible and a TAPPED land is strictly cheaper to give up, so tapped first, id-ascending, never C(n,k)
>   near-identical payments; lands whose leave trigger the engine can't fire are excluded. The Flare arm's colourless
>   sibling ("a creature", color:null) with the shared condition parser; "If it's your turn" joins the condition
>   vocabulary beside "it's not your turn". The dispatcher re-derives the COUNT and SUBTYPE from the card's own printed
>   alternative cost (the action carries only the payment) and fails fast on a short payment or a wrong land.
> · **Runtime:** `WITNESS fireblastAlt {"sacrificed":["p-m2","p-m1"],"left":["p-m3"],"aiLifeLost":4}` (three Mountains, one
>   tapped: ONE payment per target, the tapped one first) · one Mountain is not enough · Thunderclap on a single Mountain ·
>   Mine Collapse offered on your turn only · Dark Triumph opened by a Swamp, one payment per creature (creatures are not
>   fungible), closed without one · malformed payments throw.
> · **⏸ BANKED — a design question, not a gap:** Delraich ("sacrifice three black creatures") and Hand of Emrakul ("four
>   Eldrazi Spawn"). Creatures are not fungible, so "sacrifice N creatures" is the same fork the ledger banked for "tap N
>   untapped creatures": enumerate every combination (faithful, explosive — C(10,3) = 120 casts) or auto-pick one set
>   (bounded, but it takes a real choice away from the player). Parked until that is decided; Hand of Emrakul's identical
>   Spawn tokens may be the case that argues for a canonical set.
> · **Mutants 12/12:** the matcher · the kind unsupported · the kind unoffered · the canonical order · the count gate · the
>   yourTurn gate · the condition phrase · the colourless offer · the colourless matcher · the dispatcher's count check ·
>   its subtype check · the lands never sacrificed. Witness `app/src/lib/learn/sacrificeLandsAltCost.test.js` (9).
> · **Next:** census row ⑦ — Minotaur Explorer / Pillaging Horde's "sacrifice it unless you discard a card at random".

> ## 🔧 2026-09-30 — the trigger target chooser no longer SWALLOWS a corrupted seat (a hidden-error + friendly-fire hazard) · ±0
> Suite **1597 files / 16,560 tests** green (1 skipped); lint 0; no tier or corpus change (a runtime guard) — and no existing
> test leaned on the swallowed error.
> · Queued by ③ · 5's audit ("seen in passing, not touched"): `gameEngine.chooseTriggerTargets` wrapped `opponentsOf` in
>   `catch { return undefined; }`. buildTriggerStack reads an undefined pick as "no preference" and falls back to
>   `firstLegalChoice` — so a trigger whose controller id was corrupted took its FIRST legal target whatever side it sat
>   on (a removal trigger could hit its controller's own creature), and the error that explained it was thrown away
>   (CLAUDE.md §1.2). `opponentsOf` throws on an invalid seat at every other call site; the chooser now lets it.
> · Witness `app/src/lib/learn/triggerChooserInvalidSeat.test.js` (3): the control (a valid seat aims at the opponent's
>   creature with the friendly one listed first) · an invalid seat THROWS · the documented soft answers (no state / no
>   controller / no candidates → undefined; no safe side → NO_SAFE_TARGET) are untouched. Seen to fail: against HEAD's
>   gameEngine.js the invalid-seat test is red (it returned undefined); restored by file copy.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 5: "exile UP TO ONE target card from a graveyard" · **+10** (3 planned, 7 unplanned — every one run for real) + a pre-existing FALSE POSITIVE found and closed · corpus 14,810 (43.2%) / 34,245
> Suite **1596 files / 16,557 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,650 / 2,998). Flip-diff **+10, zero LOST, zero retiered** (tier snapshots at 61230f37 → the
> change). **Mutants 6/6 killed** (restore byte-identical).
> · **⛔ THE FALSE POSITIVE (found by this slice's first full suite).** The first flip-diff read +11 — Jack-o'-Lantern too —
>   and manaGraveyardComposition.test.js's pin ("Jack stays parked: its graveyard line IS a mana ability, which no lane
>   produces from the graveyard") went red. Probed: the pin had held for the WRONG reason. The GY-2 graveyard-exile lane
>   (parseGraveyardExileAbility — the one parse the offer, dispatcher and classifier share) DID accept "{1}, Exile this card
>   from your graveyard: Add one mana of any color": credited native-activated on its own, and OFFERED at runtime — {1}
>   paid, the card exiled, the pool empty. Jack was parked only because its other line was unparsed too. The lane now
>   refuses a mana program (CR 605.1a: it IS a mana ability; CR 605.3b: mana abilities never use the stack, and this lane
>   resolves on the stack), so Jack parks for the reason its pin states and the broken activation is no longer offered.
>   Jack is the only corpus card with a graveyard mana line. The pin's header is corrected; the upToOneCreature pin
>   ("exile up to one target creature card from a graveyard" stays unparsed until its lane's own slice) GRADUATED — that
>   slice is this one.
> · **Census row ⑤** (below the banked bloodrush row): "When this creature enters, exile up to one target card from a
>   graveyard." — Soul-Guide Gryff, Ambush Wolf, Crossroads Candleguide (planned +3; Diregraf Scavenger stays on its
>   "if a creature card was exiled this way" drain).
> · **TWO pieces, and the census could see only one.** The clause parsed LOW (the graveyard-exile anchor had no "up to
>   one" — now it stamps the up-to-N subset marker this op already carries for Decompose / Skullsnatcher). But the
>   MANDATORY form on an ETB was parked too: exile-from-graveyard over "a graveyard" reports an AMBIGUOUS intent, so the
>   flush chooser couldn't promise a side. The up-to-one form IS side-provable, on the Endurance rationale already in
>   atomTargetIntent — graveyard hate aimed at an opponent never harms the controller, and "up to one" hands the chooser
>   the empty pick, so it is never forced onto its own graveyard. The mandatory form stays ambiguous (pinned). As with
>   every targeted trigger, the α1 chooser picks for both seats.
> · **Planned runtime:** `WITNESS gyExileEnemy {"aiExile":["Grizzly Bears"],"userGraveyard":["Island"]}` · `WITNESS
>   gyExileEmptyPick {"userGraveyard":["Island"],"resolverTargets":[]}` (the NATIVE resolver ran on the empty pick — not
>   an Arbiter no-op).
> · **SEVEN UNPLANNED GAINS — the same clause in other contexts, each path run for real** (the scope probe had searched
>   only the ETB wording): Mechanical Mobster (`WITNESS mobsterConnive {"aiExile":["Grizzly Bears"],"discarded":["Shock"],
>   "mobsterCounters":1}`), Startled Relic Sloth (beginning of combat — hits the opponent, never you), Ascendant
>   Dustspeaker (the Sloth's path), Wreck Remover (ETB + 1 life), Restless Cottage (`WITNESS cottageAttack {"aiExile":
>   ["Grizzly Bears"],"food":1}`), Heritage Reclamation (mode 3: exile + draw), Rise of Extus (`WITNESS riseOfExtus
>   {"aiExile":["Grizzly Bears","Shock"],"learnPause":"optional-discard-payment"}` — the zero-card second target offered
>   too). Jack-o'-Lantern's sacrifice activation runs too (offered with AND without a target; exile + draw + sacrificed), but
>   the CARD stays parked on its graveyard mana line — see the false positive above.
> · **Mutants 6/6:** the anchor's "up to one" group · the zero-or-one stamp · the enemy intent · the intent loosened to the
>   mandatory form · the intent flipped to own (7 red, the runtime pins among them) · the graveyard lane accepting a mana
>   program again (3 red — Jack's original pin among them). Witness `app/src/lib/learn/graveyardExileUpToOne.test.js` (15).
> · **Seen in passing, not touched:** gameEngine.chooseTriggerTargets wraps `opponentsOf` in a silent
>   `catch { return undefined; }` — a swallowed error in the chooser (CLAUDE.md §1.2). Out of this slice's scope; queued
>   → FIXED in the next commit (the 🔧 entry above).
> · **Next:** census row ⑥ — Fireblast / Mogg Alarm's "you may sacrifice N Mountains rather than pay this spell's mana
>   cost" (the alt-cost lane ② · 1 extended).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 4: the COLOUR-FILTERED self-bounce · **+16** · corpus 14,800 (43.2%) / 34,245
> Suite **1595 files / 16,542 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,650 / 2,998 — none of the 16 is on the shelf). Flip-diff **+16, zero LOST, zero retiered** (tier snapshots at a63b5219 → the
> change). **Mutants 6/6 killed** (restore byte-identical).
> · **Census row ④:** "return a <colour>[ or <colour>] creature you control to its owner's hand" — 20 carriers, 16
>   sole-blocked, predicted +16 before building and measured +16: on the ETB Horned Kavu, Shivan Wurm, Silver Drake, Steel
>   Leaf Paladin, Fleetfoot Panther, Sparkcaster, Marsh Crocodile, Lava Zombie, Cavern Harpy, Razing Snidd; on the upkeep
>   Skull Collector, Stampeding Serow, Stampeding Wildebeests, Trusted Advisor, Eiganjo Free-Riders, Oni of Wild Places.
> · **The bounce was machinery** (scope `oneYouControlWorst` + `worstOwnBounceTarget` — Kor Skyfisher, Roaring Primadox,
>   the Karoos); only the colour was missing. It rides as the shared satisfier's `colorAny` restriction (CR 105.2 — red when
>   red is AMONG its colours; layer-aware and fail-closed, Deathmark's evaluator), applied to the pick's pool. The parser
>   arm sits beside the uncoloured one in zones.js; the runtime change is the pool filter.
> · **Runtime:** `WITNESS colourBounceSelf {"board":["Coral Merfolk"],"hand":["Horned Kavu"]}` (beside a blue creature the
>   Kavu returns ITSELF — these cards print no "another") · `WITNESS colourBounceUpkeep {"board":["Coral Merfolk"],"hand":
>   ["Skull Collector"]}` · a red-white Boros Recruit counts as red · no creature of the colour → a clean no-op. Vacuity
>   control: without the colour, the least-bad pick is the blue Merfolk.
> · **Parked on a second line:** Doomsday Specter (the hand-look discard), Sawtooth Loon (draw two, put two on the bottom),
>   Veil of Secrecy (splice onto Arcane), Escape Detection (freerunning).
> · **ⓘ For the play AI:** a card of this family returns ITSELF when it is the only creature of its colour, and the AI will
>   still cast it (a mana-wasting line, not a rules error) — a policy question for Omnath's lane, noted in COMMS.
> · **Mutants 6/6:** the arm · the pick never receiving the colour · the pool ignoring it · the second colour dropped · the
>   noun anchor loosened · the colour-count anchor loosened. Witness `app/src/lib/learn/colourFilteredSelfBounce.test.js` (9).
> · **Next:** the census below row ④ — bloodrush is banked; then Crossroads Candleguide / Ambush Wolf's "exile up to N
>   target card from a graveyard" ETB, then Fireblast / Mogg Alarm's "sacrifice N Mountains rather than pay" alt cost.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 3: the Rishadan pirates' TAXED EDICT · **+3** · corpus 14,784 (43.2%) / 34,245
> Suite **1594 files / 16,533 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,650 / 2,998). Flip-diff **+3, zero LOST, zero retiered** (tier snapshots at c04a5a9f → the
> change). **Mutants 11/11 killed** (restore byte-identical; none by a reference or syntax error).
> · **Census row ③** (rank order below the Glasskites; the "tap or untap" and "basic land type of your choice" rows between
>   them are the plan's banked choice classes): "When this creature enters, each opponent sacrifices a permanent of their
>   choice unless they pay {N}." — Rishadan Cutpurse {1}, Footpad {2}, Brigand {3}.
> · **Both halves existed; the composition did not.** The edict parsed HIGH on its own (its parser comment even named "the
>   Rishadan pirates"), and the taxed-payment pause is Rhystic Study's / Smothering Tithe's / Phyrexian Tyranny's.
>   `matchTaxedEdict` (templateMatchers) delegates the edict clause to `sacrificeEdictClauseParser` — one pool vocabulary —
>   and wraps it as op `taxed-edict`; `applyTaxedEdict` raises the taxed-payment choice for the OPPONENT with a new decline
>   payoff `edict` carrying the parsed atom; `resolveTaxedPaymentChoice` runs it for exactly the payer (by target, never
>   another seat), and a sacrifice pick that pauses carries the trigger's resume (the chain fires it once, when it settles).
> · **The AI keeps its mana when it has nothing to lose** (autoPickTaxedPayment: nothing in the edict's pool → decline).
> · **UI truth:** TaxedPaymentPanel names the decline per payoff — "you lose N life" (Phyrexian Tyranny's panel read "its
>   controller gets the effect", the opposite of what happens), "you sacrifice a permanent of your choice" (the pirates);
>   draw / Treasure unchanged.
> · **Runtime:** `WITNESS taxedEdictForced {"aiBoard":0,"aiGraveyard":["Grizzly Bears"]}` · `WITNESS taxedEdictPick
>   {"kept":["Island"],"sacrificed":["Grizzly Bears"]}` (a human payer picks); paying keeps the board; the carry contract
>   driven directly (no printed card puts an atom after a taxed edict — the matcher is whole-oracle — so a lost carry
>   would be invisible at the card level).
> · **A redundant guard removed rather than kept unkillable:** the matcher's `who === "eachOpponent"` check duplicated the
>   regex's "each opponent" anchor, so neither could be seen to fail alone; the anchor stays, pinned by the each-player test.
> · **Mutants 11/11:** the parser wiring · the payer anchor widened to each player · an {X} tax admitted · the controller
>   taxed · the decline running no edict · the edict aimed at the beneficiary · the resume carry dropped · the AI paying with
>   nothing to lose · the panel's edict and life lines · the choice dropping the edict. Witness
>   `app/src/lib/learn/taxedEdict.test.js` (9) + two panel pins in PendingChoicePanels.test.jsx.
> · **Next:** census row ④ — the colour-filtered self-bounce family ("return a <colour> [or <colour>] creature you control
>   to its owner's hand"; ETB and upkeep forms; ~16 sole-blocked carriers).

> ## 🔧 2026-09-30 — 09-06 PLAN STAGE ③ · 2: "can't be countered" asked AT RESOLUTION on every counter path (a CR 701.6a false positive) · ±0 · corpus 14,781
> Suite **1593 files / 16,522 tests** green (1 skipped); lint 0; corpus unchanged 14,781 / 34,245, decks 88%. Flip-diff **0 / 0 / 0** (a runtime fix — tier snapshots at 12985d1a → the
> change). **Mutants 11/11 killed** (restore byte-identical; none killed by a ReferenceError).
> · **The false positive.** Uncounterability was enforced in ONE place — the counter-TARGET enumeration, when a
>   counterspell is cast. Four paths never passed through it and countered a spell that can't be countered: Kira's
>   synchronous counter; the cast-trigger counter (`counter-cast-spell` — Vexing Bauble, Lunar Force, Hesitation, Jace's
>   emblem); the soft-counter DECLINE (ward, Diffusion Sliver); and a TARGETED counter meeting a spell made uncounterable
>   after it was cast (Vexing Shusher's grant in response — grantUncounterable.test.js pinned enumeration only).
> · **The fix: one resolution-time entry.** `counterIfCounterable` (atoms/stack.js) asks `stackSpellIsUncounterable`
>   (③ · 1's shared predicate) and only then calls the raw `counterSpellById`; Kira, the cast-trigger counter, the
>   Glasskite counter and the soft-counter decline all take it. Venser's bounce keeps the raw primitive (it is not a
>   counter) — pinned.
> · **The riders still happen — per the bundled rulings, read before building:** Swan Song (2013-09-15) "its controller
>   will get a Bird token"; Mana Drain (2020-11-10) "if the target is legal but not countered … you do add mana"; An Offer
>   You Can't Refuse (2022-04-29) the Treasures; Vexing Shusher (2020-08-07) "any additional effects … will still happen".
>   So `applyCounter` skips only the zone move when the target is legal but uncounterable; the controller rider and Mana
>   Drain's delayed {C} still fire. `WITNESS uncounterableSwanSong {"shockStayed":true,"aiBirds":1}` ·
>   `WITNESS uncounterableManaDrain {"shockStayed":true,"scheduled":1}`.
> · **No payment asked for nothing:** a soft counterspell (Mana Leak), ward and Diffusion Sliver raise no pay prompt
>   against an uncounterable spell — the trigger could counter nothing, so the only rational answer is not to pay, and
>   asking let the AI spend mana for nothing. Logged `counter-uncounterable` like every other path.
>   `WITNESS uncounterableBauble {"controlCountered":true,"withChimilResolved":true}`.
> · **Every positive case has a vacuity control beside it** (the same board without the protection, where the counter
>   lands). The decline check is a belt — every prompt path skips an uncounterable spell first, so play cannot reach it —
>   and is driven directly (a declined payment never counters a marked spell). Mutants: the entry's question · the
>   targeted counter's question · the soft prompt · the riders dropped with the counter · the cast-trigger / targeting-
>   object / decline / Kira sites back on the raw primitive · the ward and Diffusion prompts · Venser treated as a counter.
>   Witness `app/src/lib/learn/counterUncounterableAtResolution.test.js` (15).
> · **Next:** the census from row ③ (the ③ · 1 entry below lists the verdicts so far).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ③ · 1: the Glasskites' "counter that spell or ability" (a bug-signature row) · **+3** · corpus 14,781 (43.2%) / 34,245
> Suite **1592 files / 16,507 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,650 / 2,998). Flip-diff **+3, zero LOST, zero retiered** (tier snapshots at b2952a0f → the
> change). **Mutants 14/14 killed** across 11 test files (restore byte-identical).
> · **The census, re-run for stage ③ (2026-09-30 ~03:35Z):** 34,245 scanned · 19,523 non-native · 10,622 sole-blocker cards.
>   The top fifteen rows are the 09-06 plan §3's banked classes. Scope verdicts below them, in rank order:
>   ① "{2}, Exile this card from your hand: Target land gains "{T}: Add …" until this card is cast from exile. You may cast
>   this card for as long as it remains exiled." (Spara's Adjudicators, Rakish Revelers, Masked Bandits, Shattered Seraph,
>   Glamorous Outlaw — 5 carriers, 3 sole) — **BANKED**: an ability activated from the HAND (the bloodrush/channel
>   exclusion), a cast-from-exile permission, and a duration keyed to ANOTHER object's cast — new zone behavior.
>   ② the Glasskites — **BUILT** (below).
> · **A bug signature, not a missing mechanic.** Kira, Great Glass-Spinner GRANTS this exact trigger and was native
>   (kiraTargetCounter.js — a synchronous counter at the four target-choice chokepoints); the three cards that PRINT it
>   parked on it as their sole blocker. The condition was machinery already (the self becomesTarget event at all four
>   sites + the once-per-turn latch — Angelic Cub); only the payoff was unparsed, because "that spell or ability" is the
>   object whose TARGET CHOICE fired the trigger. Built as the SG-13 (Vexing Bauble) twin: the splitter rewrites the exact
>   sentence to "counter the targeting spell or ability" (no card prints it); `counterClauseParser` → op
>   `counter-targeting-object`; `checkBecomesTargetTriggers` threads `targetingStackObjectId`; a routing gate keeps the op
>   on `becomesTarget`.
> · **CR 701.6a on an UNTARGETED counter.** Uncounterability was enforced only where a counterspell's targets are
>   enumerated; a counter that names no target never passed through it. The four exclusions (on-card text · a resolved
>   grant's mark · a subtype static · a controller static) moved into ONE predicate, `stackSpellIsUncounterable`
>   (staticAbilityParser.js), read by the enumeration AND the new atom. `WITNESS glasskiteUncounterable
>   {"shockStayed":true,"damage":2}` (Chimil's controller Shocks a Glasskite: the trigger resolves, Shock lands).
> · **Caught before commit — a Kira double-model.** The first probe re-tiered Kira native-trigger → native-static: once
>   the printed trigger parsed, Kira's QUOTED body did too, and the group-grant gate emitted it — a second, stack-based
>   counter beside the module's synchronous one (an extra fizzling trigger and priority round per targeting).
>   `isModeledGroupTriggeredBody` now declines that body; Kira keeps its module (its per-creature flag is also the more
>   faithful "first time each turn" for a grant that arrives mid-turn). Pinned at the runtime: a Shock at a creature
>   under Kira stacks nothing; Kira beside a Glasskite → the Glasskite's trigger fizzles cleanly, Shock moved once.
> · **Runtime:** `WITNESS glasskiteSpell {"first":{"countered":true,"damage":0},"secondDamage":2}` — the second Shock that
>   turn resolves (the latch); a Prodigal Sorcerer ping is countered off the stack (no zone), its {T} still paid.
> · **Mutants 14/14:** the rewrite · each splitter anchor (synthetic guards — no printed card separates them: every corpus
>   "counter that spell or ability" with a rider also has an opponent-only condition) · the parser arm · the registry
>   entry · the context thread · the uncounterable check · the routing gate · the Kira decline (red in
>   kiraTargetCounter.test.js too) · the enumeration's predicate call · each of the predicate's four exclusions (each red in
>   its own pre-existing test file). Witness `app/src/lib/learn/glasskiteTargetCounter.test.js`.
> · **Next — ③ · 2, a CR 701.6a false positive the predicate makes cheap (scoped, read-only):** four counter paths call
>   `counterSpellById` without asking, AT RESOLUTION, whether the spell can be countered: Kira's synchronous counter; the
>   cast-trigger counter (Chalice of the Void, Void Mirror, Nullstone Gargoyle, Lavinia, Lunar Force, Hesitation, Vexing
>   Bauble, Jace's emblem — a Chalice on 2 would counter an Abrupt Decay); the soft-counter decline (ward, Diffusion
>   Sliver, "unless its controller pays"); and a TARGETED counter whose target was granted uncounterability in response
>   (Vexing Shusher — grantUncounterable.test.js pins enumeration only). One resolution-time check through
>   `stackSpellIsUncounterable`; Venser's bounce keeps the raw primitive (it is not a counter). Then the census from row ③.

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ② · 2: the PARTY count (a cost reducer and a layer-7c bonus) · **+4** · corpus 14,778 (43.2%) / 34,245 — **stage ② MET**
> Suite **1591 files / 16,496 tests** green (1 skipped); lint 0; decks unchanged (88%, 2,650 / 2,998). Flip-diff **+4, zero LOST, zero retiered** (tier snapshots at 19d8ba0a → the
> change). **Mutants 9/9 killed**, each run against BOTH test files separately (restore byte-identical).
> · "This spell costs {1} less to cast for each creature in your party" — ten carriers of the sentence. Built as ONE helper
>   beside `domainCount`: `layers.partyCount` = a MAXIMUM MATCHING of Cleric / Rogue / Warrior / Wizard onto the creatures
>   you control (CR 700.8 / 700.8b, verified in cr_current.json: a creature with several of those types fills ONE slot,
>   counted for the highest result — a per-type tally and a greedy first-fit are both wrong; both were mutated, both caught).
>   BOTH count evaluators route through it (`layers.countForSpec` case `party` + `atoms/shared.js`); `parseSelfCountSource`
>   reads "creature(s) in your party" → `{ kind: "party" }`.
> · **Printed reads + Changeling, not layer-aware reads — a caught recursion:** the layer-aware read re-entered the layer
>   system through Ravager's Mace's OWN party bonus (layer 7c → the party count → the P/T layers → …) and blew the stack;
>   the witness caught it (`RangeError`) and the count now reads printed type lines, the `domainCount` precedent.
> · **Flips:** Shatterskull Minotaur (→ native-body), Journey to Oblivion (→ native-trigger), Sea Gate Colossus
>   (→ native-body), **Ravager's Mace (→ native-equipment) — UNPLANNED, its runtime pinned:** `WITNESS partyMace
>   {"party":3,"power":4,"menace":true}`. The discount at a real cast: `WITNESS partyCastShatterskull {"party4":{"generic":0,
>   "R":2},"party2":{"generic":2,"R":2},"party0":{"generic":4,"R":2}}`. Deadly Alliance / Spoils of Adventure were native
>   already but cast at FULL price — the discount applies now.
> · **A park guard graduated:** perEachCostReduction.test.js's "an unmodeled count source (party) yields nothing" stood on
>   party; it now stands on Gargantuan Leech (Caves on the battlefield AND in the graveyard — still unmodeled), with a
>   positive party pin beside it. The same file's Shatterskull fixture carried a mistyped `{5}{R}` since 08-04 (printed
>   `{4}{R}{R}`, bundled oracle) — corrected; its four-Bears guard (non-party creatures never discount) re-pinned at generic 4.
>   **That guard is load-bearing:** mutant P9 ("any creature fills every role") is red ONLY there — partyCount.test.js does
>   not see it.
> · **Parked with verdicts:** Coveted Prize (the full-party free cast), Thwart the Grave (the filtered second target),
>   Zagras, Veteran Adventurer (its own "is also a Cleric …" line), Tazri. Witness `app/src/lib/learn/partyCount.test.js`.
> · **Stage ② MET** (+2 and +4; every unplanned gain's runtime pinned). Next: **stage ③, the residue loop** (the 09-06 plan
>   §3 — re-run the census, take the first ≥3-sole row below the banked list with existing machinery).

> ## 🎯 2026-09-30 — 09-06 PLAN STAGE ② · 1: the TAP-A-CREATURE alternative cost · **+2** · corpus 14,774 (43.1%) / 34,245
> Suite **1590 files / 16,486 tests** green (1 skipped); lint 0. Flip-diff **+2, zero LOST** (tier snapshots at 12a119e0 →
> the change). **Mutants 10/10 killed** (restore byte-identical).
> · "If you control a Plains, you may tap an untapped creature you control rather than pay this spell's mana cost." Probed:
>   FIVE carriers (the plan named two) — Ramosian Rally, Angelic Favor, Orim's Cure, Lashknife, Sivvi's Valor. Built
>   runtime-first: `legalChoices` offers one payment per UNTAPPED creature you control (layer-aware `permanentIsCreature`;
>   a summoning-sick creature IS legal — CR 302.6, verified in cr_current.json: it bars only the creature's own {T}
>   abilities and its attacking), label "tap <name>"; the dispatcher fails fast on a missing / tapped / non-creature
>   choice and taps through `tapPermanent`; then `castModifiers` strips the sentence (kind `tapCreature`, the existing
>   `controlLand:Plains` condition).
> · **Flips:** Ramosian Rally, Orim's Cure (arbiter-spell → native-spell). **Orim's Cure was UNPLANNED — its runtime is
>   pinned end to end:** cast by tapping one bear, shielding the other; a real 5-damage hit loses 4 (`WITNESS tapAltCure
>   {"tappedToPay":true,"unpreventedOf5":1}`). Rally: `{"b1":3,"b2":3}`. The AI never takes the tap alt for these
>   (non-interaction → human-only, the dominance filter's safe false-negative) — pinned.
> · **A fixture trap, caught and recorded:** a hand-built permanent literal taps fine but NEVER raises its own
>   becomes-tapped trigger (the trigger system reads the fields `createPermanent` stamps) — the Wanderbrine Preacher pin
>   read "no trigger" until the witness switched to engine-shaped permanents. The engine path was never wrong: a bare
>   `tapPermanent` + `flushTriggers` on the literal fixture fails the same way (probe).
> · **Parked with verdicts:** Angelic Favor on TWO lines (combat-only timing + the end-step-exiled Angel token — dropping
>   either alone does not flip it); Sivvi's Valor on its damage redirect; **Lashknife's ONLY blocker is the tap line**
>   (without it: native-aura) — the Aura path never runs `extractAltCost`; it needs a permanent-spell alt-cost offer
>   first (runtime before classifier). Next: stage ② · 2, the party-count cost reducer.
> · **Mutants:** the classifier strip · the offer kind · tapped creatures offered · summoning-sick refused · the Plains
>   condition ignored · a raw tapped write instead of `tapPermanent` (the Preacher pin) · the dispatcher accepting a
>   tapped creature · never tapping · the label · the missing-choice guard — each turned a named test red.

> ## 🔧 2026-09-30 — RELEASE-READINESS R4 + R5 + R6 · the release gate sharded · sync-spellbook honest · `[0.160.0]` cut · the ledger repaired · the logs rotated · docs QoL
> No app code changed (the last green suite, 1589 / 16,475 at 76f65fab, still covers it); lint 0.
> · **R4** (db6f08b1): release.yml's test gate is its own `test` job with ci.yml's two shards (`build` needs it;
>   workflow default `contents: read`, only `build` writes; `persist-credentials: false`); sync-spellbook.yml's
>   `continue-on-error` moved from the JOB to the sync STEP + a final step that fails the run when the sync failed;
>   `actions: write` dropped. Exercised: the manual sync-spellbook run 36659346685 ran every step — combos bulk complete
>   (112,543 variants), the per-card flag crawl rate-limited at offset 10,100 (HTTP 429 ×10), progress cached, run RED
>   (the old job-level flag would have said green). All workflow YAML made ASCII-clean (gotchas #14).
> · **R5** (dcc67fd9): `## [0.160.0] - 2026-08-16` cut — its 31 bullets moved verbatim by a verified script (+4 lines).
> · **R6**: RUN-LEDGER's 16,069-line duplicate removed (e29c5412 — proven on 26645a2a itself: repaired = parent + one
>   9-line insertion); WAKE-REPORT and RUN-LEDGER rotated into `archive/` (WAKE 5,539 → 671, RUN-LEDGER 23,409 → 2,201;
>   KT-5 re-ordered below KT-4b); the SessionStart hook anchors on `\n## LOG (newest first)` (it printed the COMMS rules
>   block and cut the newest entry); `v0.2.0` tag examples → v0.161.0 + the "one above the newest tag" rule; CLAUDE.md
>   §3.4 = the workflows as they are; a gstack-availability note; the quartet's stale Phase 2 bannered; the trap list
>   unioned; the playbooks' `npx vitest run` → the CI wrapper and the laptop `MAIN` → the install root; SHELF-85
>   bannered CLOSED; gotchas #20–#23.

> ## 🔧 2026-09-29 — RELEASE-READINESS R3 · Omnath's batch 19 merged into the play-hints ledger (a committed, tested merger) · corpus unchanged 14,772 (43.1%)
> Suite **1589 files / 16,475 tests** green (1 skipped); lint 0. **Mutants 12/12 killed** (restore byte-identical).
> · The gap: the 2026-08-16 merge was a one-off parser; nothing committed could land a later batch, and the queue's
>   contract pointed at a warm script that only PRESERVES curated entries. Batch 19 (2026-09-05: 5 new notes + 10
>   REFRESH blocks — Omnath's header says nine; the block holds ten) waited 24 days. The live ledger still carried the
>   corrected errors, e.g. Lim-Dûl's Vault as "no-shuffle" (the rulings say the rest IS shuffled).
> · Built (76f65fab): `src/lib/learn/playHintsBatch.js` (parse one batch in the bullet / REFRESH / inline forms,
>   bullets joined in the ledger's "LABEL: text · LABEL: text" register; apply by EXACT key — double-faced cards are
>   keyed "Front // Back" — keeping tier / parked; unknown names reported, never invented; input never mutated) +
>   `scripts/merge-play-hints-batch.mjs` (refuses on a missing card; backup → temp + rename → re-read verify).
> · **Merged 2026-09-30T02:14:33Z** into the live ledger (`%APPDATA%\com.colton.mtg-tool\data\card-play-hints.json`,
>   real disk — the MSIX mirror has no `com.colton.mtg-tool` folder; a probe write confirmed it first): **+5 curated**
>   (Gemstone Caverns · Hydroelectric Specimen // Hydroelectric Laboratory · Agadeem's Awakening // Agadeem, the
>   Undercrypt · The Mycosynth Gardens · Last Night Together), **10 replaced** (Nezahal · World at War · Tibalt's
>   Trickery · Transmute Artifact · Lim-Dûl's Vault · Great Train Heist · Emrakul, the Promised End · Tezzeret the
>   Seeker · Kaito, Bane of Nightmares · Roaming Throne); curated 486 → **491**; 1,640 entries unchanged; every
>   other entry byte-identical (the CLI's re-read verify). Backup: `card-play-hints.json.pre-batch19-2026-09-30T02-14-33-073Z.bak`.
> · **Mutants:** wrong bullet register · wrapped continuation dropped · the section never ends · a batch runs into the
>   next · duplicates allowed · empty note allowed · tier / parked dropped · unknown card invented · input mutated ·
>   added / replaced swapped · REFRESH-of-uncurated not flagged · inline form not read. A redundant header-skip
>   survived its mutant and was deleted.

> ## 🔧 2026-09-29 — RELEASE-READINESS R2 · an honest engine build stamp (`engineBuild.js`) · corpus unchanged 14,772 (43.1%)
> Suite **1588 files / 16,461 tests** green (1 skipped); lint 0. **Mutants 9/9 killed** (restore byte-identical).
> · The bug: every writer stamped `app/package.json`'s version — which the repo never bumps (release.yml stamps the tag
>   on the runner only) — so every local grind / self-play record since mid-August said "0.150.0" whatever engine made
>   it. Consumers compare the stamp for EQUALITY (`replay-canary.mjs` replays only same-stamp games; Omnath's
>   `pilots/ab-compare.mjs` warns "ENGINE changed" only when stamps differ) or GROUP by it (gameLogStore's per-version
>   cut — "the only way to see a fix move win rates"): all three were blind. `grindLoop.js` also hid a failed read
>   behind a silent `catch { "unknown" }`; learn saves and puzzles used `npm_package_version` (null in the exe).
> · The stamp: `git describe --tags --long --always --dirty --abbrev=8 --match v*.*.*` → semver with build metadata —
>   `0.160.0` exactly on a clean release tag (what that tag's exe carries), `0.160.0+343.g916dfa71` past it, `.dirty`
>   for uncommitted changes, `<pkg>+g<sha>` with no tag reachable (a shallow CI clone), `<pkg>+nogit` if git fails
>   (loud, never a fake release stamp). The packaged exe skips git and stamps package.json (CI-stamped with the tag).
>   git runs from the MODULE's directory, so a harness outside the repo (Omnath's pilots, cwd = the vault) still
>   describes the engine tree it loaded. The MAJOR.MINOR.PATCH prefix survives Omnath's semver gates
>   (export-training / ingest-grind-store parse with `parseInt`) — contract-tested.
> · Wired: `grindLoop.js` (the silent catch deleted — a failed stamp now rejects the loop into `state.error`),
>   `scripts/grind-pool.mjs`, `scripts/self-play.mjs`, `scripts/replay-canary.mjs`, `learnSaveStore.js`,
>   `puzzleStore.js`. Live: `0.160.0+343.g916dfa71.dirty` from `app/` AND from `%TEMP%` (the foreign-cwd case).
> · **Pins:** `engineBuild.test.js` (17 — every describe shape, the packaged / git-failure / unparsed paths, the consumer
>   parser contract, the real checkout from a foreign cwd), `grindLoopStamp.test.js` (one fake game through the REAL
>   loop — the header carries the stamp), the learn-save + puzzle round-trips. Seen to fail first: the grind header
>   read "0.150.0"; both stores read "0.150.0" (npm_package_version under `npm test`).
> · **Mutants:** a clean tag still gets a build id · the dirty flag dropped · the packaged exe runs git · a git failure
>   stamps the bare version · an unreadable package.json swallowed · git describes the cwd's repo · the grind header
>   ignores the stamp · both stores back on npm_package_version — each turned a named test red. The three CLI scripts
>   have no test harness: `node --check` + review + the shared helper's tests.

> ## 🔧 2026-09-29 — RELEASE-READINESS R1 · reference data freshness (`paths.js`): a newer bundle outranks an older synced copy · corpus unchanged 14,772 (43.1%)
> Suite **1586 files / 16,443 tests** green (1 skipped); lint 0. **Mutants 8/8 killed** (restore byte-identical).
> · The bug: `dataPath()` returned the writable AppData copy whenever one existed, so one sync (or import) shadowed
>   every newer bundle an app update brought. Live on the box: the v0.160.0 app read its 2026-07-19 sync for 72 days
>   (all seven datasets STALE in `/api/sync-data`) while v0.160.0's CI had downloaded oracle_cards fresh on 08-16
>   (202,875,214 bytes, 38,626 records).
> · The rule: for the five REFERENCE groups only — `scryfall-bulk/*` (stamp: `manifest.json` `generatedAt`), the
>   Spellbook four (`spellbook-meta.local.json` `syncedAt`), the salt pair (`edhrec-salt-meta.local.json` `syncedAt`),
>   `cardkingdom-prices.json` (its own head `generatedAt`), `rules-index.json` (mtime; a bare array) — a bundled group
>   whose stamp is STRICTLY newer is read instead. Ties, missing and unreadable stamps keep the synced copy; a group
>   decides as one unit; user data (price history, play hints, caches, logs) is never shadowed. Writes are unaffected —
>   every sync script writes `MTG_APP_ROOT/data` itself (checked: sync-scryfall-bulk, build-oracle-index,
>   build-collection-printings-index, build-rules-index, sync-spellbook, sync-edhrec-salt, sync-cardkingdom-prices).
>   `dataPathSource()` names the copy a read resolves to; `/api/sync-data` GET reports it per dataset as `source`.
> · **Pins:** `pathsReferenceFreshness.test.js` (13 — the stamps deliberately DISAGREE with file mtimes, so per-file
>   mtime logic fails) + the route's GET witness (a newer bundled rules-index reads as `source: "bundle"` with the
>   bundle's date; a Spellbook synced after the bundle stays `appdata`). Seen to fail first: 8 red on the old
>   `dataPath()`, 2 red on the old route.
> · **Mutants:** tie → bundle · non-reference files join the rule · an unprovable synced side switches · the embedded
>   stamp ignored · per-file mtimes instead of the group stamp · no mtime fallback · `dataPathSource` inverted · the
>   route's `source` hard-coded — each turned a named test red.
> · **Acceptance after the release (plan R7):** once the box's app updates to v0.161.0, `GET /api/sync-data` shows
>   `source: "bundle"` with the release's dates instead of 2026-07-19.

> ## 🎯 2026-09-06 (cron) — QUARTET Phase 4 step 3 · COLOUR WORDS in a spend restriction — the LAST class; step 3 CLOSES · **+5** · corpus 14,772 (43.1%) / 34,245
> Suite **1585 files / 16429 tests** green; lint 0. Flip-diff **+5, zero LOST** (every unplanned gain audited whole-card). **mutants 5/5 killed.**
> · The 09-06 plan's stage ①: Shrine of the Forsaken Gods ("Spend this mana only to cast colorless spells. Activate only if you
>   control seven or more lands.") and Eldrazi Temple ("colorless Eldrazi spells or activate abilities of colorless Eldrazi").
>   A colour PREDICATE beside the type words: `castColorless` (checked against the cast card's colours BEFORE the type walk, so
>   the bare "@any-spell" of "colorless spells" cannot short-circuit past it) and `abilityColorless` (checked against the
>   activating source's layer-aware colours — every activation site now passes activatingColors beside the creature flag and
>   the type line; no colour context ⇒ refuse). The plural ability tail "activate abilities of colorless Eldrazi" parses beside
>   the singular "an ability of a <Subtype> source" form. The extra-mana-line regex admits a restricted PIP line with an
>   activation gate; Shrine's "seven or more lands" rides the existing activationCondition read (the record exists only with
>   seven lands — pinned).
> · **Pins:** both restrictions' shapes; both lands `land`. RUNTIME through manaSources + canAfford: Temple's {C}{C} pays a
>   colourless Eldrazi spell and a colourless Eldrazi source's ability, never a red Eldrazi's, a colourless Bear's, or a
>   context-less spend; Shrine's pays a colourless spell of any type and never a coloured one. Mutants: the cast colour check
>   gone, the activation colour check gone, the regex refusing the line (dead mana), the colour word dropped without the flag,
>   the planner not forwarding the colours — mutants 5/5 killed.
> · **Whole-card:** five flips, each read whole-card: Shrine of the Forsaken Gods, Eldrazi Temple, and the plural ability tail as a LIST with card-type words (Soldevi Machinist 'abilities of artifacts', Steelswarm Operator 'abilities of artifact sources', Sunken Citadel 'abilities of land sources' — matched at payment against the activating source's type line; the Shang-Chi-era arm that refused any non-creature form is retired; two older pins that asserted the tail was IGNORED now assert it is HONOURED with allow-check negatives); zero LOST, zero retiered
> · **CI:** repo flipped PUBLIC on Colton's order (2026-09-05, chat); the held stack pushed with this commit

> ## 🎯 2026-09-06 (cron) — RESIDUE GRIND RG-9 · THE DOMAIN COUNT (Stratadon and kin) · **+6** · corpus 14,767 (43.1%) / 34,245
> Suite **1584 files / 16426 tests** green; lint 0. Flip-diff **+6, zero LOST** (every unplanned gain audited whole-card). **mutants 5/5 killed.**
> · The first of the three rows the 04:20Z census left with existing machinery: "Domain — This spell costs {1} less to cast for
>   each basic land type among lands you control." The self cost-reduction lane's "for each" arm existed; its own count parser
>   (parseSelfCountSource) lacked the domain count and the sentence walker stripped only Morbid's label. Now: {kind:"domain"}
>   → countForSpec counts the DISTINCT basic land types among the controller's lands off the front-face type lines; the Domain
>   label is stripped like Morbid's. Granted basic types (Urborg / Yavimaya) are not counted — a documented under-read.
> · ⛔ THE FLIP-DIFF AUDIT CAUGHT A HOLLOW BEFORE COMMIT: the count also unparked the ATTACHED per-count bonus lane (Strength of
>   Unity, Exotic Curse, Manaforce Mace — "gets +1/+1 for each basic land type among lands you control") — and a runtime probe
>   showed the Aura classifying native while the layer engine read NO bonus. The layer engine keeps its OWN count evaluator
>   (layers.countForSpec) beside effects/atoms/shared's, and only the latter had learned "domain". Fixed at the root: ONE
>   exported helper (layers.domainCount) that both evaluators call, so a layer bonus and a cast reduction can never disagree
>   about domain again; the Aura is pinned (a Bear under Strength of Unity with two basic types among three lands is a 4/4).
> · **Pins:** Stratadon native; the Aura's layer read. RUNTIME through the real cast offer: five basics of five types turn {10}
>   into {5} and the five lands cast it; five basics of FOUR types leave {6} and it is not offered. Mutants: the arm gone,
>   the count as LANDS rather than types (the over-read), the layer evaluator forgetting the kind (the hollow), the label not
>   stripped (parser and classifier) — mutants 5/5 killed.
> · **Whole-card:** six flips, each read whole-card: Stratadon, Yavimaya Sojourner and Leyline Binding (the cost line; Binding's exile-until ETB was modeled), Strength of Unity, Exotic Curse and Manaforce Mace (the attached per-count bonus — the layer read pinned after the hollow); Draco stays parked on its domain-reduced upkeep payment; zero LOST, zero retiered
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates

> ## 🎯 2026-09-06 (cron) — QUARTET Phase 4 step 3 · SECLUDED COURTYARD — the chosen-type form with its ability tail · **+1** · corpus 14,761 (43.1%) / 34,245
> Suite **1583 files / 16423 tests** green; lint 0. Flip-diff **+1, zero LOST** (every unplanned gain audited whole-card). **mutants 4/4 killed.**
> · The last named carrier class but one: the chosen-type spend form (Cavern of Souls / Unclaimed Territory — live since CAP-CAVERN)
>   with the ABILITY tail the Cavern slice had refused ("… or activate an ability of a creature source of the chosen type"). The
>   parse records an "@chosenType" placeholder in abilityOf; resolveSourceRestriction swaps it for the land's chosen word beside
>   the cast types it already prefixed, so the activation branch matches the activating source's type line; an unresolved
>   choice empties BOTH halves (pays nothing — pinned); the extra-mana-line regex admits the tail.
> · **Pins:** the parse (castTypes [creature], abilityOf [@chosenType], chosenType); Secluded Courtyard → land. RUNTIME through
>   manaSources + canAfford with a chosen Dinosaur: pays a Dinosaur creature spell and a Dinosaur source's ability, never a
>   Bear's; unchosen pays nothing. Mutants: the tail ignored, the chosen word not swapped in, the regex refusing the tail (dead
>   mana), an unresolved choice keeping its ability half (the FP) — mutants 4/4 killed.
> · **Whole-card:** flip-diff exactly Secluded Courtyard; zero LOST, zero retiered
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Jurassic Ramp 86 → 87**; Cap 87 unchanged (Secluded Courtyard was already credited there through Cavern's lane — its ability half is now real at runtime)

> ## 🎯 2026-09-06 (cron) — QUARTET Phase 4 step 3 · THE NEGATIVE SPEND FORM + THE POWERSTONE TOKEN (Koilos Roc / Stone Retrieval Unit …) · **+18** · corpus 14,760 (43.1%) / 34,245
> Suite **1582 files / 16421 tests** green; lint 0. Flip-diff **+18, zero LOST** (every unplanned gain audited whole-card). **mutants 4/4 killed.**
> · The carrier class the residue census had banked twice: the Powerstone token was kept out of the registry ON PURPOSE because
>   its mana is restricted by a NEGATIVE sentence the model could not read — "This mana can't be spent to cast a nonartifact
>   spell." parseSpendRestriction now reads "can't be spent to cast a non<Type> spell" as casts of that type ONLY plus every
>   ability spend (abilityOf "@any" — the sentence restricts casting alone; CR 106.6); a negated word outside the vocabulary
>   refuses the whole restriction. restrictedManaProduction strips the sentence before the production parse; the token joins
>   NAMED_TOKENS with its printed reminder text; the named-token creator accepts "powerstone" (the tapped form rides the flag).
> · **Pins:** the parse (castTypes [artifact], abilityOf [@any]); Koilos Roc and Stone Retrieval Unit native. RUNTIME: a Powerstone
>   taps for a {C} that pays an artifact spell and any ability and never a creature spell; the Roc's ETB creates the token TAPPED
>   through the real flush and stack. Mutants: the negative parse gone (the laundering FP), the @any branch gone, the creator
>   forgetting the word, the sentence not stripped (dead mana) — mutants 4/4 killed.
> · **Whole-card:** 18 flips, each read whole-card: every one creates a tapped Powerstone (an ETB, a dies trigger, an end-step trigger, a modal mode, a spell tail, Hall of Tagsin's activation) or prints the negative sentence on its own mana line (Hydraulic Helper's {U}, The Mightstone and Weakstone's {C}{C} with the plural 'spells'); Horned Stoneseeker's 'sacrifice a Powerstone' leaves rides the fungible-type sacrifice lane; the base Splitting the Powerstone stays parked on its sacrificed-artifact-was-legendary rider. SIX CREED park guards GRADUATED on their own evidence — the '⛔ POWERSTONE IS NOT NEXT' trap sprang exactly as its author designed (the objection arrived at the edit): its precondition ('no restriction tracking') ended with the quartet's Phase 4 core, and its assertions now pin the token's RESTRICTION instead; bloodToken / thenSplit / effectAtoms / parser.test's negatives moved to Incubator (transform, still unmodeled); spendRestrictedMana's 'can't be spent to' pin now expects the restricted production. The first suite showed all nine red; the rerun is the green of record; zero LOST, zero retiered
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Brago Blink 85 → 86** (Static Net); Halfshell 84, Cap 87 unchanged

> ## 🎯 2026-09-06 (cron) — QUARTET Phase 4 step 3 · THE ABILITY TAIL of a spend restriction (Avengers Tower's shape) · **+0** · corpus 14,742 (43.1%) / 34,245
> Suite **1581 files / 16418 tests** green; lint 0. Flip-diff **+0, zero LOST** (every unplanned gain audited whole-card). **mutants 5/5 killed (one survivor got its missing test — the end-to-end offer pin through legalActionsForPlayer).**
> · The carrier class named by the previous slice: "Spend this mana only to cast a Hero spell OR TO ACTIVATE AN ABILITY OF A
>   HERO SOURCE" (Avengers Tower, Jasmine Dragon Tea Shop, Base Camp, Villainous Hideout, Brotherhood Headquarters). Three
>   pieces, one seam: ① parseSpendRestriction records the tail's type words in abilityOf beside the cast types (both spellings —
>   "to activate" / "activate"; comma lists; the closed vocabulary); ② spendRestrictionAllows's activation branch matches a
>   SUBTYPE against the activating source's type line — every activation site (seven in legalChoices, one in the dispatcher)
>   now passes activatingTypeLine beside the creature flag it already passed; a record with both halves pays either purpose;
>   ③ the extra-mana-line regex admits the tail and comma lists.
> · ⚠️ THE THIRD PIECE CLOSED A DEAD-MANA GAP THE PREVIOUS SLICE OPENED: Base Camp, Jasmine, Villainous Hideout and Brotherhood
>   Headquarters flipped to `land` on 2026-09-06 through the classifier's land lane while manaSources emitted ONLY their {C}
>   line — the any-colour restricted line produced nothing (an under-read, the safe direction, but a land credited native with
>   a dead line). The extra-line regex was the refuser; it now admits the shape, and the record exists (pinned on the Tea Shop).
> · **Pins:** the Tower's and the Tea Shop's parse (castTypes + abilityOf); the Tea Shop → land; the Tower stays land-partial (its
>   Hero-tutor activation is its own blocker). RUNTIME through manaSources + canAfford: the restricted record pays an Ally's
>   spell and an Ally source's ability, refuses a Bear's spell, a Bear source's ability, and a context-less spend. Mutants: the
>   tail parse gone, the activation branch ignoring the source's type (the laundering FP), the regex refusing the tail (dead
>   mana), the sites not passing the type line — mutants 5/5 killed (one survivor got its missing test — the end-to-end offer pin through legalActionsForPlayer).
> · **Whole-card:** flip-diff +0 / 0 lost by design — the classifier had credited these lands the previous slice; this slice made their restricted lines REAL at runtime (records exist, tribal abilities payable, everything else refused)
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · no deck moves (a runtime correction: the four tribal lands' restricted lines now produce, and tribal abilities are payable); Cap 87 waits on Avengers Tower's tutor line

> ## 🎯 2026-09-06 (cron) — QUARTET Phase 4 step 3 · TURTLE LAIR — the restricted-spend vocabulary admits CR creature types · **+9** · corpus 14,742 (43.1%) / 34,245
> Suite **1580 files / 16415 tests** green; lint 0. Flip-diff **+9, zero LOST** (every unplanned gain audited whole-card). **mutants 2/2 killed.**
> · With the overnight plan's stages met and the residue census dry, the seat took the QUARTET's first open item that the plan
>   allows as an interleave: Phase 4 (restricted-spend mana) step 3 — the printed forms per carrier class. Its core has been
>   live since 2026-08-15 (Klauth, Rivaz, Cavern); SHELF-85 sized Turtle Lair SUBSYSTEM-L on the assumption the lane was
>   missing — the probe showed the lane present and only the VOCABULARY refusing: "Spend this mana only to cast a Ninja or
>   Turtle spell" failed the curated word list. parseSpendRestriction now admits any CR creature type (the same closed
>   vocabulary the subtype target-noun peel uses) beside that list; spendRestrictionAllows already matched type-line words
>   at payment, so the parse and the planner agree by construction. Sliver Hive's mana line parses the same way.
> · **Pins:** Turtle Lair → land. RUNTIME through manaSources + canAfford: the any-colour record carries castTypes [ninja,
>   turtle]; it pays {U} for a Ninja and never for a Bear. Mutants: the admission gone, the planner ignoring the type (the
>   laundering FP) — mutants 2/2 killed.
> · **Whole-card:** nine flips, each read whole-card: Turtle Lair, Sliver Hive, Ally Encampment, Tournament Grounds (its three-way {R}, {W}, or {B} line was already read), Brotherhood Headquarters, Base Camp, A-Base Camp, Villainous Hideout, Jasmine Dragon Tea Shop. ⚠️ DOCUMENTED UNDER-READ on four of them: the '… or to activate an ability of a <Subtype> source' tail (and Headquarters' 'a spell that has freerunning') is DROPPED by the clause walk — the restriction records the cast types only, and spendRestrictionAllows refuses every ability spend on a castTypes-only record, so the seat never spends that mana on an ability it could legally pay: the strictly conservative direction (CREED). The ability tail is the next Phase 4 carrier class. sarkhanFireblood.test.js's vocabulary guard GRADUATED ('Elephant' is a CR type now admitted) — its negative moved to a non-type word; the first suite showed it red, the rerun is the green of record; zero LOST, zero retiered
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Halfshell heroes 83 → 84** (its ceiling note stands — one to the bar, the rest L)

> ## 🅿 2026-09-06 (cron) — RESIDUE GRIND · the vein is dry at this census — two more families scoped and BANKED
> · **Buyback (all forms)** — the census prints it as five rows (mana, sacrifice a land, discard N, pay N life, and compounds). The
>   mana form is deliberately NOT stripped as a vacuous keyword: its return-to-hand changes the resolution (textNormalize's
>   madness note names exactly this FP). A real build = an OPTIONAL additional cost at the offer (mana merged into the cost, or a
>   land sacrifice through the sac-a-permanent plumbing) + a `buyback` stamp on the stack object + a resolution finalizer that
>   hands the card back instead of graveyarding it. New zone behaviour at resolution — subsystem-class, not a residue slice.
> · **The Clockwork family** ("whenever this creature attacks or blocks, remove a +1/+1 counter from it at end of combat", 4 sole)
>   — a delayed end-of-combat effect from a combat trigger: the delayed-trigger lane (Tempestra / Shredder's end-of-combat
>   sacrifice was sized L on the shelf for the same reason).
> · Everything above them in the census is sub-game or CHOICE machinery. Eight residue families shipped today after SHELF-85
>   closed (+37 corpus, 14,696 → 14,733 · 43.0%); the vein at ≥3 sole blockers with existing machinery is exhausted. Next for
>   a seat: the QUARTET (Colton's ordered subsystems), which is also what unparks the choice rows and the Powerstone token.

> ## 🎯 2026-09-06 (cron) — RESIDUE GRIND RG-8 · THE BRINGERS' OWN FIVE-PIP ALTERNATIVE COST · **+3** · corpus 14,733 (43.0%) / 34,245
> Suite **1579 files / 16413 tests** green; lint 0. Flip-diff **+3, zero LOST** (every unplanned gain audited whole-card). **mutants 5/5 killed.**
> · The 21:30Z census's first buildable family: "You may pay {W}{U}{B}{R}{G} rather than pay this spell's mana cost." (the five
>   Bringers; 3 sole + 2 co). CR 118.9 — the card's OWN fixed-mana alternative cost. The alt-cost lane's kinds cannot carry a
>   MANA payment (its dispatcher branch pays no mana), so this rides the cost-VARIANT emission RG-5 built for Fist of Suns,
>   keyed on the card's own text (textNormalize.fixedManaAltCostOf): a second cast action whose cost IS the pips, the ordinary
>   payment path pays it, the printed-cost action survives beside it only when payable. The card's own pips take precedence
>   over a Fist grant (for the Bringers they coincide). The classifier's permanent lane covers the sentence as modelled residue
>   (beside the evoke allowance); castModifiers strips it for a spell's program parse (a "fixedMana" alt kind the offer lane
>   deliberately does not enumerate).
> · **Pins:** Blue and Green Bringers native; a spell-lane SHAPE pin ({R}{R}{R}) native; Bringer of the Red Dawn PARKED — its upkeep
>   is gain-control (Colton's theft veto). RUNTIME: five basics → the nine-drop castable only through its own variant (cost
>   W/U/B/R/G), dispatching taps all five; four basics → nothing. Mutants: the allowance gone, the own-pips read gone, the
>   spell-lane matcher gone, the variant mispriced — mutants 5/5 killed.
> · **Whole-card:** flip-diff exactly Blue, White and Green Dawn (their upkeeps — draw two, return an artifact card, a Beast token — were already modeled); Black Dawn stays parked on its pay-2-life tutor-to-top upkeep, Red Dawn on its gain-control upkeep (the theft veto); zero LOST, zero retiered
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates

> ## 🎯 2026-09-05 (cron) — RESIDUE GRIND RG-7 · DISCARD A CARD AT RANDOM (the cost — Frenetic Ogre / Ogre Shaman / Pyromania / Sonic Burst …) · **+16** · corpus 14,730 (43.0%) / 34,245
> Suite **1578 files / 16411 tests** green; lint 0. Flip-diff **+16, zero LOST** (every unplanned gain audited whole-card). **mutants 5/5 killed (one survivor resolved: the compound-half parser's copy of the arm had no printed carrier — deleted, not left dead).**
> · One mechanism the census printed as a dozen rows: "discard a card at random" as a COST — the activated form ("{R},
>   Discard a card at random: …", ~10 sole blockers across shapes) and the additional-cost form ("As an additional cost to
>   cast this spell, discard a card at random." — 3 sole). The chosen-discard cost already ran on both lanes (one action per
>   hand card; the dispatcher pitches the chosen one). A random discard is NOT a choice: the offer is ONE action carrying
>   `discardRandom`, and the dispatcher picks the card at PAYMENT with the game's seeded rng (deterministicRng off
>   state.rngSeed, then the seed advances — the shuffle discipline, so a replay reproduces the pick; pinned). The spell
>   being cast is never its own pitch. An empty hand offers nothing. Parsers: abilities.js (the cost item), castModifiers.js
>   (both extract sites).
> · **Pins:** the carriers native. RUNTIME: a three-card hand yields ONE activation; paying it pitches one card, advances the
>   seed, replays identically, and the pump reaches the stack; Sonic Burst pitches one of the OTHER cards and goes to the
>   stack. Mutants: the ability-cost arm gone, the additional-cost arm gone, the seed not advanced (the replay pin), the
>   activated offer emitting per-card choices again — mutants 5/5 killed (one survivor resolved: the compound-half parser's copy of the arm had no printed carrier — deleted, not left dead).
> · **Whole-card:** 16 flips, each read whole-card: the activated family (Frenetic Ogre, Ogre Shaman, Pyromania, Stormbind, Amok, Coral Helm, Mage il-Vec, Canyon Drake, Pardic Swordsmith, Pardic Lancer, Dwarven Strike Force, Hell-Bent Raider, Draconian Cylix) and the additional-cost family (Sonic Burst, Sonic Seizure, Acceptable Losses) — every other line on them was already modeled; zero LOST, zero retiered. discardTrigger.test.js's wiring tripwire fired (13 → 14 hand→graveyard sites) exactly as designed — the new site fires checkDiscardTriggers, the count moved, the invariant held; the rerun is the green of record
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates

> ## 🎯 2026-09-05 (cron) — RESIDUE GRIND RG-6 · BECOMES COLORLESS (Raging Spirit / Ancient Kavu / Blazing Blade Askari) · **+3** · corpus 14,714 (43.0%) / 34,245
> Suite **1577 files / 16407 tests** green; lint 0. Flip-diff **+3, zero LOST** (any unplanned gains audited whole-card). **mutants 2/2 killed.**
> · Scoped and BANKED before this one (the triage ledger, per RESIDUE-GRIND-RUNBOOK §3.5): the tapped Powerstone ETB (the
>   Powerstone token is unmodeled ON PURPOSE — its "can't be spent to cast a nonartifact spell" mana is the QUARTET's
>   restricted-spend subsystem, not a residue slice); "sacrifice it unless {G} was spent to cast it" (a new stamp threaded
>   from the dispatcher's payment plan onto the entering permanent — a new value path between objects); "{C}: becomes the
>   color of your choice" (a choice — the choice-eval subsystem). Three banked in a row; the fourth is a slice:
> · "{2}: This creature becomes colorless until end of turn." — CR 105.2c: colourless is the EMPTY colour set, and the
>   become-color atom (a layer-5 setColor write until end of turn) already expresses any colour set; only the "colorless"
>   spelling had no arm. Two arms (self + targeted), no new op, no new gate.
> · **Pins:** the carriers native. RUNTIME through the real activation and stack: a red Kavu reads colourless after the ability
>   resolves. Mutants: the self arm gone, the colour set not empty — mutants 2/2 killed.
> · **Whole-card:** flip-diff exactly the three carriers (Raging Spirit, Ancient Kavu, Blazing Blade Askari — its flanking line was already modeled); zero LOST, zero retiered. becomeColor.test.js's CREED negative ('colorless is not a colour change') GRADUATED — the first suite showed it red; the negative moved to a TYPE quality ('becomes an artifact'), and the rerun is the green of record
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates

> ## 🎯 2026-09-05 (cron) — RESIDUE GRIND RG-5 · FIST OF SUNS (Fist of Suns / Jodah, Archmage Eternal) · **+3** · corpus 14,711 (43.0%) / 34,245
> Suite **1576 files / 16405 tests** green; lint 0. Flip-diff **+3, zero LOST** (any unplanned gains audited whole-card). **mutants 5/5 killed.**
> · The census's next buildable family: "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast." — a
>   board-granted ALTERNATIVE cost (CR 118.9). The engine's alt-cost lane read only the SPELL's own text and paid its kinds
>   (life, a pitch, a sacrifice, returned lands) in the dispatcher's no-mana branch — a five-pip alternative is MANA, so it
>   goes the other way: the hand-cast enumeration offers a second cast VARIANT whose cost IS the five pips, and the ordinary
>   payment path plans and pays it (never the altCost branch). The printed-cost action survives beside it only when it is
>   itself payable — the caster picks one. Hand casts only; never a free cast; never an X spell (X would be 0 under an
>   alternative cost — a different, unmodeled line); the five pips must be payable right now. Controller-scoped. Marker in
>   parseStaticAbilities; the reader in effects/textNormalize.js (a leaf).
> · **Pins:** the carriers native. RUNTIME through legalActionsForPlayer + dispatchAction: five basics + Fist → a six-drop is
>   castable ONLY through the WUBRG variant (cost W/U/B/R/G, generic 0), dispatching it puts the spell on the stack and taps
>   all five; no Fist → no cast; four basics → no cast. Mutants: the marker gone, the offer gone, the payability check gone (an
>   unpayable promise), the variant keeping the printed cost — mutants 5/5 killed.
> · **Whole-card:** flip-diff: Fist of Suns, Jodah + one unplanned gain audited whole-card — Leyline of Mutation (the same sentence beside the opening-hand Leyline line the classifier already pre-strips); zero LOST, zero retiered
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates

> ## 🎯 2026-09-05 (cron) — RESIDUE GRIND RG-4 · SKIP YOUR DRAW STEP (Wild Wasteland / Yawgmoth's Bargain / Dragon Appeasement / Symbiotic Deployment) · **+4** · corpus 14,708 (43.0%) / 34,245
> Suite **1575 files / 16403 tests** green; lint 0. Flip-diff **+4, zero LOST** (any unplanned gains audited whole-card). **mutants 3/3 killed.**
> · The census's next buildable family: "Skip your draw step." — four sole blockers (ten co-blockers), one sentence, one rule
>   (CR 614.10: the step is skipped; nothing happens in it). A static marker in parseStaticAbilities credits the line; the
>   reader lives in effects/textNormalize.js (a leaf) and is CONTROLLER-scoped — "your" draw step is the carrier's controller's,
>   so an opponent's carrier never skips yours (pinned). The turn engine's draw-step case reads it for the ACTIVE player before
>   the turn-based draw: the step is logged `skipped:"static"` beside the first-turn skip, no card is drawn, no draw-step draw
>   watcher fires.
> · **Whole-card of the four flips:** Wild Wasteland (the impulse upkeep was modeled), Symbiotic Deployment (the tap-two-creatures draw), Dragon Appeasement (the sacrifice-draw), Yawgmoth's Bargain (Pay 1 life: draw). The census's other examples stay parked on their OWN blockers — Recycle / Null Profusion print "whenever you PLAY a card" (not cast), Taigam its look-three pick and exile-X activation — pinned as negatives.
> · **Pins:** Wasteland / Bargain / Appeasement native; Taigam and Recycle body-only. RUNTIME through nextStep: from
>   the upkeep into the draw step with Wild Wasteland out → no card, the step logged skipped; without it → one card; with an
>   OPPONENT's Wasteland → one card. Mutants: the marker gone, the engine ignoring the reader, the reader losing its controller
>   scope — mutants 3/3 killed.
> · **Whole-card:** flip-diff exactly the four (Wild Wasteland, Symbiotic Deployment, Dragon Appeasement, Yawgmoth's Bargain) — each audited above; zero LOST, zero retiered. The witness's first Recycle fixture was a made-up 'cast' variant; corrected to the real 'play a card' text and pinned as parked (the suite of record is the rerun with the corrected file)
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates

> ## 🎯 2026-09-05 (cron) — RESIDUE GRIND RG-3 · THE GRAVEYARD-CAST REDUCER (Patrician Geist / Gravebreaker Lamia / …) · **+2** · corpus 14,704 (42.9%) / 34,245
> Suite **1574 files / 16401 tests** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 2/2 killed.**
> · The census's next buildable family: "Spells you cast from your graveyard cost {1} less to cast." — three sole blockers, one
>   sentence. The zone-keyed reducer already existed for Doc Aurlock's two-zone printing (castFromZones) and both cast sites
>   already pass the spell's origin zone to costReductionForSpell; only the single-zone sentence had no arm. One regex →
>   castFromZones:["graveyard"] (never castFromNotHand — an exile or library-top cast is NOT in the printed list; pinned).
> · **Pins:** the carriers native. RUNTIME through collectCostReducers + costReductionForSpell: a graveyard cast is {1} cheaper,
>   a hand cast and an exile cast are not. Mutants: the arm gone, the zone list widened to every non-hand zone — mutants 2/2 killed.
> · **Whole-card:** flip-diff exactly Patrician Geist + Gravebreaker Lamia (the census's third example carries another blocker); zero LOST, zero retiered
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates

> ## 🎯 2026-09-05 (cron) — RESIDUE GRIND RG-2 · TORPOR ORB (Torpor Orb / Hushwing Gryff / Tocatli Honor Guard) · **+3** · corpus 14,702 (42.9%) / 34,245
> Suite **1573 files / 16,399 tests** green; lint 0. Flip-diff **+3, zero LOST** (any unplanned gains audited whole-card). **mutants 3/3 killed.**
> · The census's next buildable family by BLEND: "Creatures entering don't cause abilities to trigger." — three sole blockers,
>   the Orb EDHREC-popular, one sentence, one CR rule (603.2 — the ability never triggers; nothing is countered).
> · THE BUILD: a static marker in parseStaticAbilities (the artifact-lock discipline) so the classifier credits the line; the
>   reader lives in effects/textNormalize.js (a leaf both sides import — one regex, no drift): `creatureEntersSuppressed(state,
>   enteredPerm)` = a live scan of EVERY battlefield for the sentence AND the entering permanent is a creature by its printed
>   front-face type line. Both enters-event dispatchers (checkEnterTriggers — the "etb" event every ETB and "whenever a creature
>   enters" watcher rides — and checkPermanentEntersTriggers) return early under it, so the creature's own ETB and every
>   watcher's trigger never exist. A noncreature entering is untouched. The carrier's own arrival counts (Hushwing Gryff
>   silences its own entrance — the published ruling), because the scan runs once the carrier is already on the battlefield.
> · **Pins:** the three carriers native. RUNTIME: under the Orb a creature's ETB and a Soul Warden watcher raise nothing; without
>   it both fire; an artifact's ETB still fires under the Orb. Mutants: the marker gone, the dispatcher ignoring the carrier,
>   the creature check gone (the over-read) — mutants 3/3 killed.
> · **Whole-card:** flip-diff exactly the three carriers (Torpor Orb, Hushwing Gryff, Tocatli Honor Guard); zero LOST, zero retiered
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates

> ## 🎯 2026-09-05 (cron) — RESIDUE GRIND RG-1 · THE DRAW DOUBLER (Teferi's Ageless Insight / Alhammarret's Archive / Bard, King of Dale) · **+3** · corpus 14,699 (42.9%) / 34,245
> Suite **1572 files / 16397 tests** green; lint 0. Flip-diff **+3, zero LOST** (any unplanned gains audited whole-card). **mutants 5/5 killed.**
> · The overnight plan's stages are met and SHELF-85 is through Phase 4, so this seat returned to the census-driven residue
>   grind (RESIDUE-GRIND-RUNBOOK §2): a fresh deletion-probe census (34,245 scanned · 19,605 non-native · 10,673 sole-blocker
>   cards · 99,055 probes in 100 s). The top of the list is sub-game machinery (initiative, double team, attractions,
>   specialize, stickers, contraptions, the Ring) — banked, not sliced. The first buildable family by BLEND: "If you would
>   draw a card except the first one you draw in each of your draw steps, draw two cards instead" — three sole blockers, two
>   of them EDHREC-popular Commander staples, ONE sentence.
> · THE BUILD: a `draw` entry on replacementEffects.doublerProfile (the Rhox Faithmender / Bruvac discipline) + drawMultiplier
>   (scope: the controller only; two stack ×4); read at the ONE draw chokepoint, gameState.drawCards, which now takes a
>   `drawStep` flag the draw-step site passes — the turn-based draw stays one card, every other draw of N becomes N × mult.
>   The classifier's modeled-doubler gate and isPureDoubler learn the sentence, so Alhammarret's life half (already
>   modeled) and Bard's token half (already modeled) compose whole-card.
> · **Pins:** the three carriers native. RUNTIME: a spell draw of 1 → 2 (cardsDrawnThisTurn 2, so draw watchers fire twice —
>   CR 121.2); the draw step's first → 1; a draw-step draw of 3 → 1 + 2×2; an opponent's draw → 1; Insight + Archive → 4.
>   Mutants: the profile arm gone, the chokepoint ignoring the multiplier, the draw-step exemption gone (the over-read), the
>   owner scope gone, the classifier gate forgetting the shape — mutants 5/5 killed.
> · **Whole-card:** flip-diff exactly the three carriers (Teferi's Ageless Insight, Bard, King of Dale, Alhammarret's Archive); Alhammarret's life doubler and Bard's token doubler were already modeled on the same profile; zero LOST, zero retiered
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates

> ## 🏁 2026-09-05 (cron) — SHELF-85 · PHASE 3 CLOSED · PHASE 4 POSTED — the Omnath hand-off list · corpus 14,696 / 34,245 (42.9%)
> · Phase 3 ran ten slices after the 14:15Z Phase 2 close (Endurance, Desert, Xenagos, Wheel and Deal, Molten Psyche, Solid
>   Footing, Razorkin Needlehead, Field-Tested Frying Pan, Treebeard + the subtype target-noun vein, Incubation Druid) —
>   Nekusar 87 → 90 and Bumble Flower 88 → 90 crossed the bar; Hulk sits at 89 with L rows only; the re-run one-line-away
>   instrument shows no S/M row touching two decks → §4.3 step 5 holds and Phase 3 closes.
> · Phase 4 (§4.4): the list is generated, not hand-typed — a fresh dump of every shelf deck's parked cards, each joined to
>   its one-line-away blocker (or marked composite) and its §5 reason (THEFT / PREGAME / SUBSYSTEM-L / CREED / the Phase 3
>   stop rule) — `docs/orchestration/SHELF-85-OMNATH-HANDOFF.md` (291 parked slots across the 27 non-ceiling decks; 29 cards
>   in 2+ decks; the three ceiling decks' 62 cards were posted at 15:10Z as [Q-SHELF-85-OMNATH-A]). Posted to Omnath as
>   **[Q-SHELF-85-OMNATH]** and mirrored into the vault; the wake report carries the §1 table at its end state:
>   13 decks ≥90 · 14 at 85–89 · 3 ceilings (Atraxa 74, Halfshell 83, Light-Paws 82).
> · **CI:** BLOCKED (repo private → billing); 94 slice commits (95 with this docs commit) commits held on the full local gates [Q-CI2].
> · Next for this seat: the overnight plan's stage list is exhausted on this seat (§1–§3 met; §4-END routed to SHELF-85, now done through Phase 4) — boot the corpus roadmap (`memory/orders/cindy-corpus-roadmap.md`, the BLEND ladder) unless Colton's next order lands; re-probe §6 parks that the subtype-noun peel may have unparked; and push the held stack the moment `gh run list` shows a green run

> ## 🎯 2026-09-05 (cron) — PHASE 3 · INCUBATION DRUID — the type a land you control could produce · **+2** · corpus 14,696 (42.9%) / 34,245
> Suite **1571 files / 16395 tests** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · Phase 3 step 3 — the re-run one-line-away instrument (after the subtype-noun vein) showed exactly ONE S/M row touching two
>   decks: Incubation Druid (Shalai and Hallar · Zaxara) — "{T}: Add one mana of any type that a land you control could
>   produce. If this creature has a +1/+1 counter on it, add three mana of that type instead." The adapt line was native; the
>   mana line had no arm — the Exotic Orchard / Reflecting Pool family, read on the controller's side. manaProduction gains
>   the arm as a board-derived colour set (colorsAmongSpec "landsYouControlCouldProduce" — the Plaza of Heroes discipline,
>   never the free any-colour arm); manaSources resolves it LIVE as the union of each controlled land's own production
>   (basics through CR 305.6; a land whose own set is board-derived is skipped — no recursion) and its granted basic types
>   (Urborg / Yavimaya). Colourless is a type. No land that makes anything → the source is not offered.
> · ⚠️ DOCUMENTED UNDER-READ: the counter-gated "add three … instead" is read as the base amount — the same under-read the
>   any-colour + instead forms already carry (the runtime produces 1 where the card would make 3: the safe direction).
> · **Pins:** native-mana. RUNTIME through manaSources: Forest + Island → the Druid offers exactly {G, U}; no lands → the
>   Druid is not offered; an Urborg'd board offers the granted Swamp. Mutants: the arm gone, the lands ignored (every type —
>   the laundering FP), an empty land set still offered, granted types ignored — mutants 4/4 killed.
> · **Whole-card:** one unplanned gain, audited whole-card: Naga Vitalist — its ONLY line is the same sentence ("{T}: Add one mana of any type that a land you control could produce")
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Shalai and Hallar 86 → 87 · Zaxara 94 → 95.** Phase 3 step 5 now holds: no S/M row touches two decks, and every 85–89 deck is at 90 or carries only L / 🅿 / composite rows — PHASE 3 CLOSES; Phase 4 (the Omnath hand-off list) is next

> ## 🎯 2026-09-05 (cron) — PHASE 3 · TREEBEARD, GRACIOUS HOST — the SUBTYPE TARGET NOUN (a corpus vein) + lifegain counters on a target · **+66** · corpus 14,694 (42.9%) / 34,245
> Suite **1570 files / 16393 tests** green; lint 0. Flip-diff **+66, zero LOST** (every unplanned gain audited whole-card — see below). **mutants 6/6 killed.**
> · Phase 3 step 2 (Bumble Flower's last row to the bar) that turned out to be step 3 material: "Whenever you gain life, put
>   that many +1/+1 counters on target Halfling or Treefolk." The probe showed the real blocker was not the amount — it was
>   the NOUN. "target <Subtype>" was unmodeled as a target everywhere: "Destroy target Elf", "Tap target Merfolk", "target
>   Wolf or Werewolf gets +2/+2" all sat on the Arbiter. 238 bundled cards print a bare creature-subtype noun as a target.
> · THE PEEL (parser.parseClauseToAtom's fallback, beside the referent peel): every arm gets the clause whole first; only when
>   all refuse does "[Tt]arget <Sub>[ or <Sub>][ creature][ you control]" reduce to "target creature[ you control]" and the
>   arms get the reduced clause — honoured ONLY when the result is a PLAIN creature-targeting atom (no role / fighter /
>   multi-target list), which then carries {kind:"subtype", subtypes:[…]} — a restriction creatureSatisfiesRestrictions
>   enforces at BOTH the enumerator (targeting.expandAtoms) and the resolver, now union-aware ("A or B" = either). CLOSED
>   vocabulary: both words must be CR creature types (CR_CREATURE_TYPES) — "target Saga" / "target Elf creature card" never
>   peel (pinned). CR 205.3d.
> · ⛔ THE WHOLE-CARD AUDIT OF 66 FLIPS: the snapshot flipped 66 cards, and the audit flagged Misery Charm — "Return target
>   Cleric CARD from your graveyard to your hand" looked like a noun the peel could widen to "target creature card" (a
>   Cleric-only return becoming any creature card: an FP). It was NOT the peel: that mode was already native through zones'
>   SUBTYPE RETURN lane (its own closed-vocabulary card filter); the Charm's blocker had been mode 1, "Destroy target
>   Cleric". The peel still gained the fence the audit asked for — the noun must END the target phrase, a lookahead refuses a
>   card / spell / permanent / token tail — pinned on a noun the engine does not model ("Counter target Elf spell" parks).
>   The other 65 were read one by one — every one is a battlefield creature target ("another target Vampire you control",
>   "target Elf or Soldier creature", "up to one target Zombie you control", "Destroy target Wall") on an arm that was
>   already native for the plain noun; the "another" forms keep their existing source-exclusion.
> · THE COUNTERS: the lifegain "that many" accumulator knew only its SELF form (Sunbond); the detector now inserts the same
>   sentinel on the targeted form and counters.js gains the targeted twin (countContext:"lifegainAmount", targetType:
>   "creature" — resolveScaledAmount's generic ctx read, the existing routing pin).
> · **Pins:** Treebeard native-trigger; "Destroy target Elf" / the "Wolf or Werewolf" pump / "Put two +1/+1 counters on target
>   Halfling or Treefolk" native; "Destroy target Saga" and "target Elf creature card" parked. RUNTIME through the real
>   lifegain trigger, flush and stack: the trigger offers the Halfling AND Treebeard itself (a Treefolk) and never the Bear;
>   a gain of 2 puts two counters on the chosen Halfling. Mutants: the vocabulary gone, the union collapsed, the targeted
>   arm gone, the rewrite gone, the sentence-initial "Target" refused, the plain-creature guard gone — mutants 6/6 killed.
> · **Whole-card:** 66 flips audited one by one — every one a battlefield creature-subtype target on an already-native arm (Dwarven Lieutenant, Shining Armor, Swift Warden, Advocate of the Beast, Wirewood Lodge, Aeronaut Cavalry, Merfolk Sovereign, Crawl from the Cellar, Stromkirk Mentor, Private Eye, Kitsune Diviner, Patagia Tiger, Halo Hunter, Garrison Griffin, Sanguine Glorifier, Earth Kingdom Protectors, Nezumi Shadow-Watcher, Ezekiel Sims, Blinkmoth Nexus, Captain Storm, Brallin, Misery Charm, The Wasp, Cleansing Ray, Anointed Deacon, Arashin Foremost, Lady Spider, Vinebred Brawler, Poison-Blade Mentor, Daughter of the Deep, Nectar Faerie, Safewright Cavalry, Jade Bearer, Sygg, Deeproot Elite, Intrepid Provisioner, Tunnel, Treebeard, Guy in the Chair, Goblin Digging Team, Jade Guardian, Goblin Wizard, King Suleiman, Tributary Vaulter, Howling Moon, Pirate's Cutlass, Grassland Crusader, Chaos Charm, Griffin Canyon, Tivadar of Thorn, Stromkirk Bloodthief, Deepchannel Duelist, Dwarven Demolition Team, Rend Spirit, Goblin Masons, Majestic Heliopterus, Coastal Drake, Aquatic Incursion, Blaster Mage, One-Clown Band + 6 more in the diff file); zero LOST, zero retiered. Three CREED park guards GRADUATED and moved to a word outside the CR vocabulary (koglaTitanApe: 'target Dragon' / the two Human forms now HIGH with their restrictions; sliverBounce: 'target Wombat' — Wombat IS a CR type; parser.test's must-drop gate: Huatli's 'up to one target Dinosaur you control' moved out with a note). The first full suite showed those four (red); the rerun is the green of record
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Bumble Flower Combo 89 → 90 — AT THE BAR** (with Nekusar 90: two decks crossed 90 this Phase 3). Hulk stays 89 (L rows only); Wolverine 88 / cdh 88 / Cap 87 carry only composites, L, 🅿 or a subsystem — §4.3 step 5 closes them. The re-run one-line-away instrument shows ONE multi-deck S/M row left: Incubation Druid (Shalai + Zaxara) — next, then Phase 3 closes

> ## 🎯 2026-09-05 (cron) — PHASE 3 · FIELD-TESTED FRYING PAN — the granted pump scaled by the life just gained · **+1** · corpus 14,628 (42.7%) / 34,245
> Suite **1569 files / 16392 tests** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 5/5 killed.**
> · Phase 3 step 2 — Bumble Flower Combo at 88, two rows from the bar; this is the first: the Equipment's ETB (Food + a
>   Halfling token, auto-attach) and its equip line were native, and the granted body — "Whenever you gain life, this
>   creature gets +X/+X until end of turn, where X is the amount of life you gained" — parked on its AMOUNT. The lifegain
>   trigger already threads the gained amount (ctx.lifegainAmount — Sunbond's "that many" counters, Sanguine Bond's "that
>   much" drain); the pump had no reader. The detector's lifegain rewrite gains the printed phrase → the unprintable "the
>   lifegain amount" sentinel; the self-pump arm maps it to countContext:"lifegainAmount" (the routing pin already keeps that
>   context on the lifegain event — no new pin); applyPumpEffect reads it into both pips through the existing `scaled` lane.
>   The granted-trigger runtime (grantedTriggersForHost) carries it to the equipped creature unchanged.
> · ⛔ THE SECOND SEAM THE PROBE HID: with the body fixed, the whole card STILL read body-only — the granted-trigger
>   Aura/Equipment classifier gate (coverage.isNativeTriggerGrantAuraOrEquipment) refused ANY line beside the grant and the
>   Equip cost, so the Pan's own ETB (Food + Halfling + self-attach — natively routed on its own) was residue. The gate now
>   admits an own triggered line when that line ALONE detects as exactly one natively-routed trigger of the card — the
>   same test the plain equipment lane applies to its own triggers, the same runtime (the normal trigger path). An unrouted
>   own trigger still parks the card (pinned: "each opponent secretly chooses a number").
> · **Retiered (same playability, not tallied):** Giant Inheritance native-aura → native-trigger, Infinity Formula
>   native-equipment → native-trigger — each has an own natively-routed trigger beside a static+granted-trigger line, so the
>   1c lane now claims them first; the layer engine applies their bonuses regardless of the label. Audited whole-card.
> · **Pins:** the Equipment and the bare body native; the unrouted-own-trigger negative. RUNTIME: the controller gains 3 → the
>   equipped 1/1 reads 4/4 through the real trigger flush and stack; an opponent's gain leaves it 1/1. Mutants: the arm gone,
>   the pump ignoring the context, the detector's rewrite gone, the gate refusing the own line again, the allowance
>   forgetting the routing check — mutants 5/5 killed.
> · **Whole-card:** flip-diff exactly Field-Tested Frying Pan + two RETIERS (Giant Inheritance, Infinity Formula — same playability, audited whole-card above)
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Bumble Flower Combo 88 → 89** (one row to the bar: Treebeard — the lifegain "that many" counters on a SUBTYPE target, "target Halfling or Treefolk"; the probe shows "target <Subtype>" is unmodeled as a target noun everywhere — even "Destroy target Elf" is Arbiter — so that is the next slice, sized M, a corpus vein)

> ## 🎯 2026-09-05 (cron) — PHASE 3 · RAZORKIN NEEDLEHEAD — the suffix time gate + the object-pronoun draw referent · **+1** · corpus 14,627 (42.7%) / 34,245
> Suite **1568 files / 16389 tests** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 3/3 killed.**
> · Phase 3 step 2 — Nekusar Wheels at 89, one row from the bar: "This creature has first strike during your turn. / Whenever
>   an opponent draws a card, this creature deals 1 damage to them." Both lines parked on ONE-WORD seams of native lanes:
>   ① the your-turn self keyword grant read only the PREFIX form ("During your turn, this creature has …") — the suffix form
>   now takes the identical yourTurn-gated descriptor (layers.gateMet re-reads activePlayer every derive); ② the card-drawn
>   referent rewrite knew "that player" and the clause-leading "they lose N life" (Sheoldred) — the clause-FINAL object
>   pronoun "… damage to them" now rewrites to the same drawing-player sentinel, on an ALLOWLIST of the trigger SCOPE
>   (opponentDraw / anyDraw). ⛔ `whose` was the wrong discriminator: the own-draw scope "you" ALSO carries whose:"any", so a
>   whose-guard let "Whenever you draw a card, … deals 1 damage to them" read as a self-ping — the witness's negative caught
>   it on the first run (native-trigger), the guard moved to the scope. No new atom, no new gate.
> · **Pins:** native; the trigger shape (cardDrawn / opponentDraw); the you-draw negative (parked). RUNTIME: first strike live on the
>   controller's turn and absent on an opponent's; an opponent's draw costs THEM 1 life through the real trigger flush and
>   stack, the controller's own draw fires nothing. Mutants: the suffix alternative gone, the pronoun rewrite gone, the whose
>   guard gone — mutants 3/3 killed.
> · **Whole-card:** no unplanned gains (flip-diff exactly Razorkin); the drawing-player sentinel's other readers (Fate Unraveler / Underworld Dreams / Sheoldred / Smothering Tithe) are unchanged — their suites green
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Nekusar Wheels 89 → 90 — AT THE BAR.** Hulk stays 89 with only L rows (Arena, Balduvian Trading Post, Moonmist, Fire Nation Palace's until-end-of-combat mana, Mjölnir, Thunderclap's behold, World War Hulk, Avengers Tower, Earth's Mightiest Heroes) — §4.3 step 5 closes it at 89

> ## 🎯 2026-09-05 (cron) — PHASE 3 · SOLID FOOTING — the attached bonus gated on a printed host keyword · **+1** · corpus 14,626 (42.7%) / 34,245
> Suite **1567 files / 16,385 tests** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 6/6 killed.**
> · Phase 3 step 4 — an S row left in a deck at its ceiling (Light-Paws): "As long as enchanted creature has vigilance, it
>   assigns combat damage equal to its toughness rather than its power." The conditional attached-bonus lane (Face of
>   Divinity's another-Aura gate, Shardmage's Rescue's entered-this-turn gate) gains its third condition — the HOST has a
>   keyword — and its gateable set widens from keyword grants to the toughness-assigns layer-6 op (the Gauntlets of Light
>   op). ⛔ THE GATE READS THE HOST'S PRINTED KEYWORD LINE, NEVER THE LAYER DERIVE: gateMet runs inside the continuous-effect
>   collection, and permanentHasKeyword would re-enter it (the ES-1 trap the attached-bonus code already documents). So a
>   GRANTED vigilance never switches the assignment on — a documented UNDER-read, the safe direction (the host keeps
>   assigning its power). The classifier's Aura residue walk gained the matching allowance.
> · **Pins:** the bonus (the pump + the gated op, the gate carrying the keyword); native. RUNTIME through the layer engine: a
>   vigilant 2/4 host under Solid Footing reads toughness 5 and assigns with it; a host without vigilance keeps the +1/+1 and
>   assigns its power. Mutants: the condition arm gone, the gate ignoring the keyword, the classifier allowance forgetting the
>   condition, the toughness-assigns READER ignoring op.gate (the FP the whole slice hinges on — that reader had never seen a
>   gated op), the bare attached form gone, the gateable set refusing the toughness op — mutants 6/6 killed.
> · **Whole-card:** no unplanned gains (flip-diff exactly Solid Footing); Face of Divinity / Shardmage's Rescue keep their gates (the widened gateable set admits only the toughness op, whose reader now honours gates). ⚠️ The FIRST full suite was RED by one: gauntletsOfLight.test.js pinned "Solid Footing stays unread" as its CREED negative — GRADUATED, the negative moved to a conditional P/T Aura form ("as long as enchanted creature has vigilance, it gets +2/+2" — refused all-or-nothing, body-only). The commit b58e453e landed before that rerun (a chain-ordering slip: the docs script ran off a grep that did not gate on the fail count); the follow-up commit carries the moved pin and the green suite of record.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Light-Paws Voltron 81 → 82** (ceiling stands — every other row L; the Phase 4 list already names the rest). Sai (Shorikai) probed: its "Sacrifice two artifacts" cost is a non-fungible CHOICE the auto-pick refuses by design → 🅿 CHOICE-EVAL (the quartet), not an S row

> ## 🎯 2026-09-05 (cron) — PHASE 3 · MOLTEN PSYCHE — per-opponent damage from each player's own draws · **+1** · corpus 14,625 (42.7%) / 34,245
> Suite **1566 files / 16,383 tests** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 8/8 killed.**
> · Phase 3 step 2 — Nekusar Wheels' next row: "Each player shuffles the cards from their hand into their library, then
>   draws that many cards. Metalcraft — If you control three or more artifacts, Molten Psyche deals damage to each opponent
>   equal to the number of cards that player has drawn this turn." The wheel half was native and the metalcraft condition
>   was already readable (the leading-if peel stamps it on a non-targeting atom); the damage half needed a PER-OPPONENT
>   amount — each opponent's own cardsDrawnThisTurn — which the each-opponent damage atom had no field for (its amounts were
>   one number for all). One arm (`amountPerOpponent: "cardsDrawnThisTurn"`), threaded by the deal-damage resolver into
>   applyDamageEffect, whose each-opponent branch now hits each player with their own count (read at resolution, so the
>   wheel's own redraw counts — CR 608.2c, the sentences in written order); the zero-amount guard admits the per-opponent
>   kind. Every fixed-amount hit is byte-identical.
> · ⛔ THREE SEAMS THE PROBE DID NOT SHOW (the whole card read low with every half green in isolation): ① the new arm had
>   to sit BEFORE the generic "deals damage to X equal to the number of Y" arm — that arm claimed the sentence, its count
>   parser knew no per-player drawn count, and a registered parser's null ENDS the clause (no fall-through); ② the wheel
>   sentence with company — splitClauses severed ", then draws that many cards" (Winds of Change is a one-sentence card and
>   never met the splitter; Dark Deal's keep-whole guard gained a sibling) and matchWindsOfChange was whole-oracle only (now
>   also a clause parser); ③ the arm's prefix is COMMA-FREE: a lazy `.+?` swallowed an unpeeled "Metalcraft — If you control
>   three or more artifacts, Molten Psyche" and returned UNCONDITIONAL damage — a FORBIDDEN FP caught by the probe and pinned.
> · ⭐ RUNTIME CORRECTION (CR 121.1): Winds of Change AND the Timetwister wheel drew their cards back by RAW SLICE — no
>   cardsDrawnThisTurn, no draw watchers. Both now route through applyDrawEffect: Molten Psyche reads the redraw, and a
>   Nekusar wheel wakes Nekusar (the deck's commander never fired off its own wheels before). Hand/library counts identical.
> · **Pins:** the whole card (the wheel atom + the conditioned per-opponent damage); native-spell; the unpeeled-label FP
>   guard (low, never unconditional). RUNTIME through the real cast: three artifacts, an opponent who had drawn 3 with a
>   2-card hand — they wheel to two and take 5 (3 + the 2 redrawn), the caster takes nothing; two artifacts — the wheel
>   happens and no damage lands. Mutants: the arm gone, the per-opponent amount ignored, the zero-amount guard unwidened,
>   the resolver not threading the kind, the wheel not a clause parser, the splitter severing the wheel, the comma-free
>   prefix relaxed, the wheel's draw-back a raw slice again — mutants 8/8 killed.
> · **Whole-card:** no unplanned gains (flip-diff exactly Molten Psyche); the wheel draw-back correction changes no hand or library count — windsOfChange / timetwisterWheel / darkDeal suites green unchanged
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Nekusar Wheels 88 → 89** (Phase 3 step 2; the ≤3-row decks — Bumble 88 / Wolverine / Cap remain; Solid Footing next in Light-Paws)

> ## 🎯 2026-09-05 (cron) — PHASE 3 · WHEEL AND DEAL — any number of target opponents wheel · **+1** · corpus 14,624 (42.7%) / 34,245
> Suite **1565 files / 16,379 tests** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · Phase 3 step 2 — Nekusar Wheels sits at 87 with three rows to 90; Wheel and Deal is the cheapest: "Any number of target
>   opponents each discard their hands, then draw seven cards. Draw a card." Three pieces already existed: the whole-hand
>   discard for a targeted player, the draw for targeted players, and the bound-referent mechanism (an atom whose targets
>   are the previous atom's). What was missing was the composition on a PLAYER subset — the "any number of target …" wrapper
>   was creature-only. One composite matcher: the whole-hand discard on `targetType: "opponent"` with the any-number subset
>   fields (minTargets 0 / maxTargets 99 / anyNumber — the same subset path a creature "any number of" takes; the cast lane
>   enumerates every subset of the opponents, the empty one included), then the seven-card draw with bindPreviousTargets so
>   it lands on exactly the chosen players. The opponent target type keeps the caster out of the pool and gives the atom its
>   enemy intent for free. The second sentence's "Draw a card" was native.
> · **Pins:** the three atoms in order (the discard's subset fields, the bound draw, the controller's draw); native-spell.
>   RUNTIME through the real cast on a THREE-seat table: the offer enumerates exactly the four opponent subsets (none, each
>   one, both — never the caster); choosing both, each opponent's hand (2 and 3 cards) hits the graveyard and refills to
>   seven while the caster draws one; choosing one, only that opponent wheels. Mutants: the matcher gone, the draw unbound,
>   the discard demoted to one card, the targets widened to players — mutants 4/4 killed.
> · **Whole-card:** no unplanned gains; darkDeal.test.js's CREED park guard for Wheel and Deal GRADUATED (its negatives moved to the still-real 'minus two' shape)
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Nekusar Wheels 87 → 88** (Phase 3 step 2 — the ≤3-row decks; Molten Psyche next)

> ## 🎯 2026-09-05 (cron) — PHASE 3 · XENAGOS, GOD OF REVELS — the power-to-both pump · **+1** · corpus 14,623 (42.7%) / 34,245
> Suite **1564 files / 16,376** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · Phase 3 step 2 — Hulk Smash's next row: "At the beginning of combat on your turn, another target creature you control
>   gains haste and gets +X/+X until end of turn, where X is that creature's power." The combat-start trigger, the
>   another-target-you-control pump (excludeSource) and the double-P/T mechanism all existed; the mechanism knew "double
>   the power and toughness" (each half from its own value) and "double the power" (toughness untouched), never "+X/+X
>   where X is the power" — the POWER added to BOTH halves. One arm (the haste + the power-scaled pump) and a third mode
>   (`doublePt: "powerToBoth"`) in the resolver: the target's layer-aware power at resolution (CR 608.2h) lands as +P/+P
>   beside the granted haste, per target, no 0-floor (the mechanism's signed discipline). Xenagos's devotion static and
>   indestructible were native already. The splitter was the second seam once more (the Karametra / Avatar State lesson):
>   the arm matched in isolation while the driver severed "gains haste and gets +X/+X …" at its " and " — one keep-whole
>   guard for the exact sentence.
> · **Pins:** the combat-begin trigger with the atom (creatureYouControl, excludeSource, haste, powerToBoth); native-mixed.
>   RUNTIME through the real step trigger + chooser: a 3/1 becomes 6/4 with haste at the beginning of your combat; a
>   creature-typed source with the same sentence never targets itself; nothing fires on an opponent's combat. Mutants:
>   the arm gone, the mode read as double-P/T, the source exclusion dropped, the splitter guard gone — mutants 4/4 killed.
> · **Whole-card:** no unplanned gains — the shape prints on Xenagos alone (the creature-typed carrier in the witness is synthetic).
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Hulk 88 → **89** (89/100; 1 to 90). Hulk's remaining rows: Fire Nation Palace (M — a granted firebending N the trigger side must read), Moonmist / Arena / Balduvian Trading Post (L). Next: Wheel and Deal (Nekusar) — the any-number opponent wheel, staged.

> ## 🎯 2026-09-05 (cron) — PHASE 3 · DESERT — the combat-step activation rider · **+1** · corpus 14,622 (42.7%) / 34,245
> Suite **1563 files / 16,373** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 3/3 killed.**
> · Phase 3 step 2 — Hulk Smash sits at 87 with three rows to 90; Desert is the cheapest: "{T}: This land deals 1 damage to
>   target attacking creature. Activate only during the end of combat step." The combat-role target (④-AE's window) and the
>   ping existed; the trailing timing rider sat in the effect text and dragged it LOW. The ability parser peels "Activate only
>   during the <beginning of combat|declare attackers|declare blockers|combat damage|end of combat> step" into
>   `combatStepOnly` — the engine's own step key — and actionsActivateAbility opens such an ability in EXACTLY that step of
>   the combat window (the defender holds priority there on the attacker's turn, CR 602.2), never the main phase and never
>   another combat step. Stripped only because it is enforced (the ONCE-1 / precombat riders' discipline).
> · **Pins:** two abilities, the ping carrying `combatStepOnly: "end-of-combat"` with a clean effect and modeled; Desert
>   native. RUNTIME through the real offer: in the end of combat step the ping is offered against the attacker and resolving
>   it kills the 2/1; in declare blockers, combat damage, and the defender's own main phase nothing is offered. Mutants: the
>   rider never peeled, the step gate dropped, the step key left unmapped — mutants 3/3 killed.
> · **Whole-card:** no unplanned gains — the only corpus carrier of an end-of-combat activation rider in the shelf; the other four step words are admitted by the same anchor and stay parked until a carrier arrives.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Hulk 87 → **88** (88/100; 2 to 90). Next Hulk row: Xenagos, God of Revels (the power-to-both pump — staged), then Fire Nation Palace (firebending — a keyword lane question) / Moonmist / Arena / Balduvian Trading Post (L).

> ## 🎯 2026-09-05 (cron) — PHASE 3 · ENDURANCE — a chosen player's graveyard to the bottom of their library · **+1** · corpus 14,621 (42.7%) / 34,245
> Suite **1562 files / 16,371** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 5/5 killed.**
> · Phase 2 closed with every open deck at its ceiling; Phase 3 (§4.3) opened on the runbook's own gate. Step 3's one-line-away
>   probe put Endurance first — one line from native in FOUR shelf decks (Shalai, Rashmi, Kinnan, Squirrel Girl): "When this
>   creature enters, up to one target player puts all the cards from their graveyard on the bottom of their library in a
>   random order." One atom (gy-to-library-bottom): a chosen player — optional, the "up to one" riding the same maxTargets 1 /
>   minTargets 0 subset path a creature "up to one" takes — whose WHOLE graveyard moves to the BOTTOM of their library. Not a
>   shuffle (CR 701.24 does not apply): each card is appended through moveCardToZone's default bottom placement in an order
>   drawn from the state's seeded RNG (deterministicRng + advanceRngSeed, the shuffleSeededLibrary discipline — never
>   Math.random), so the library above the moved cards is untouched and a known top card stays known. The atom's intent is
>   ENEMY (atomTargetIntent) so the trigger chooser can place it: graveyard denial aimed at an opponent is the play and can
>   never harm the controller. Flash, Reach and the exile-a-green-card Evoke were native already.
> · **Pins:** the ETB detected; the atom (targetType player, up to one); enemy intent; native-trigger. RUNTIME through
>   checkEnterTriggers + the real trigger chooser: three cards in the opponent's graveyard → their yard empties, all three
>   sit at the BOTTOM of their library, the known top and second cards stay put, the controller's own yard is untouched, the
>   log names the player and the count; the same seed gives the same bottom order and the seed advances; an empty opponent
>   graveyard is a logged no-op with the library untouched. Mutants: the arm gone, the resolver moving nothing, the cards
>   placed on top, the seed frozen, the intent made ambiguous — mutants 5/5 killed.
> · **Whole-card:** no unplanned gains — the sentence prints on Endurance alone; its Flash, Reach and exile-a-green-card Evoke were native already.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Shalai 85 → **86** · Kinnan 85 → **86** (Rashmi and Squirrel Girl carry it too). Next Phase 3 rows: Desert (Hulk 87 → the combat-step activation rider, S), then Wheel and Deal (Nekusar — a player-side any-number wrapper + a bound draw, M), Treebeard / Xenagos / Molten Psyche / Iron Man (M+).

> ## 🎯 2026-09-05 (cron) — Phase 2 · L4: SENTINEL'S MARK — the Addendum main-phase look-back · **+2** · corpus 14,620 (42.7%) / 34,245
> Suite **1561 files / 16,367** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 5/5 killed.**
> · "Addendum — When this Aura enters, if you cast it during your main phase, enchanted creature gains lifelink until end
>   of turn." The Aura's own ETB parked on its intervening-if: no per-spell record of WHEN it was cast existed. The cast
>   chokepoint (actionDispatcher, where castFromZone and the colours spent are already threaded) now stamps
>   `castDuringMainPhase` — the caster is the active player and the phase is a main phase (CR 505.1; the stack may hold
>   other objects — "during" is the phase, not an empty stack) — the Aura cast resolver carries it, and `wasCast`, onto
>   the entering Aura (the permanent resolver stamped both for creatures already), and one interveningIf arm answers "you
>   cast it during your main phase" from the triggering Aura's stamps — the same triggering lookup the cast-from-hand
>   reader uses. A permanent that arrived any other way carries no stamp and reads false. THE LABEL WAS THE SECOND SEAM:
>   "Addendum —" is a CR 207.2c ability word with no rules meaning, but the Aura lanes (parseAttachedBonus's clause loop and
>   the two residue walks) saw "addendum — when this aura enters …" and no longer recognised the trigger line, so it
>   poisoned the whole bonus parse to [] — the card stayed body-only with the reader in place. The three Aura walks now
>   strip the CR 207.2c label off the oracle first (textNormalize's stripAbilityWordLabel — the same list the spell lane
>   uses), so an ability-worded Aura trigger reads as the trigger it is.
> · **Pins:** the ETB descriptor's condition; the reader; native-aura. RUNTIME through the real cast: in your precombat main
>   the Aura enters stamped (wasCast too), the host reads 3/4 with vigilance AND lifelink after the ETB resolves. ⚠️ THE
>   FALSE BRANCH IS PINNED AT THE READER, NOT FAKED THROUGH A CAST: the offer never casts an Aura outside its main-phase
>   window (the Flash speed goes unused — a standing, documented under-offer), so a flash-in during combat or on the
>   opponent's turn is unreachable today; castDuringMainPhaseNow is exported and pinned directly (own main / own postcombat
>   main → true; own combat → false; the opponent's main → false). Mutants: the stamp always false, the stamp ignoring
>   whose turn it is, the Aura resolver dropping it, the reader arm gone, the Addendum label strip gone — mutants 5/5 killed.
> · **Whole-card:** Aboshan's Desire (unplanned gain) — "Threshold — Enchanted creature has shroud as long as there are seven or more cards in your graveyard": the same CR 207.2c label strip let its trigger-free bonus lines read; the shroud carries the existing graveyard-count gate (cardsInGraveyard ≥ 7, gateOn source), audited in the parse — never an ungated shroud.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Light-Paws 80 → **81** (81/100; 4 to the bar) — LIGHT-PAWS CEILING for Phase 2 (noted in §5.12): every remaining row sizes L. Every open §5 deck now carries a ceiling (Atraxa 74 · Halfshell 83 · Light-Paws 81 · Bumble 88) → Phase 3 (§4.3, the hard-wins sweep) opens: instruments re-run, the 85–89 decks ≤3 rows from 90, the one-line-away probe for multi-deck S/M rows.

> ## 🎯 2026-09-05 (cron) — Phase 2 · L6: DAYBREAK CORONET — the with-another-Aura Enchant restriction · **+1** · corpus 14,618 (42.7%) / 34,245
> Suite **1560 files / 16,364** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 2/2 killed.**
> · "Enchant creature with another Aura attached to it / Enchanted creature gets +3/+3 and has first strike, vigilance, and
>   lifelink." The bonus parsed all along; the ENCHANT line's subject had no restriction reading, so the host spec was null
>   and the cast lane could enumerate no host — the whole card parked on one phrase. creatureEnchantRestrictions gains the
>   phrase → the existing `enchanted` restriction kind (an Aura attached, whoever controls it — the predicate Winds of
>   Rath, Greater Auramancy and Karametra's Blessing read), which the cast-target enumeration already honours.
> · **Pins:** the host spec (creature + the enchanted restriction); native-aura. RUNTIME through the real offer: a bare
>   creature of yours, a bare creature of theirs and an Aura-wearing creature of theirs on the board — only the wearer is
>   offered as a host. Mutants: the phrase gone, the phrase read as a bare creature — mutants 2/2 killed.
> · **Whole-card:** no unplanned gains. Five CREED park guards graduated (they had pinned this exact subject as inexpressible): their pins moved to 'creature with a shield counter on it' — a counter kind no restriction reads — so the negatives stay real.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Light-Paws 79 → **80** (80/100; 5 to the bar). Next: Sentinel's Mark (the Addendum main-phase look-back — the stamp, the reader and the Aura resolver are built; the CR 207.2c label strip in the Aura walks is the last piece). After it every remaining Light-Paws row sizes L (the commander's conditional Aura tutor-attached, With Great Power's per-attachment pump + redirection, Umbra Mystic's group umbra armor, Celestial Mantle, Mantle of the Ancients, the rest of L6).

> ## 🎯 2026-09-05 (cron) — Phase 2 · L5: ENTER THE AVATAR STATE — the becomes-a-subtype-and-gains pump · **+1** · corpus 14,618 (42.7%) / 34,245
> Suite **1559 files (1555 green + the 4 graduated-guard files rerun green)** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 5/5 killed.**
> · "Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flying, first
>   strike, lifelink, and hexproof." The keyword pump existed; the subtype half did not — one arm in the pump parser
>   emitting the pump with an `addSubtype` rider (the set-base-pt-team arm's shape), and the resolver lays a layer-4
>   subtype union on the pumped target under the same endOfTurn duration as its keywords. Only the ADDITIVE form is
>   admitted — a replacing "becomes a Dragon" would need the setCreatureSubtypes op and parks (CREED). The you-control
>   restriction rides the pump's target enumeration. The corpus prints this shape on one card. The splitter was the second
>   seam again (the Karametra lesson): the arm matched in isolation while the driver shattered "… and gains flying, first
>   strike, lifelink, and hexproof" on its " and "s — one keep-whole guard for this exact sentence shape.
> · **Pins:** the atom (four keywords, the Avatar rider, the restriction); native-spell. RUNTIME through the real cast: only
>   your creature is offered as a target; resolving reads the target as a Bear AND an Avatar (layer 4) with flying, first
>   strike, lifelink and hexproof; the opponent's creature is untouched. Mutants: the arm gone, the subtype rider never
>   landing, the restriction dropped, the keywords dropped, the splitter guard gone — mutants 5/5 killed.
> · **Whole-card:** no unplanned gains — the shape prints on this card alone.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Light-Paws 78 → **79** on this slice alone (the measure in this run read 80 because the Daybreak Coronet edit was already in the tree; Coronet's own commit follows). Next: Daybreak Coronet (S), then Sentinel's Mark (M).

> ## 🎯 2026-09-05 (cron) — Phase 2 · L4: SHIELDED BY FAITH + BRILLIANT WINGS — attach-on-enter Auras · **+4** · corpus 14,616 (42.7%) / 34,245
> Suite **1558 files / 16,360** green; lint 0. Flip-diff **+4, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · "Whenever a creature enters, you may attach this Aura to that creature." / "Whenever a creature you control enters, you
>   may pay {1}. If you do, attach this Aura to that creature." The attach family had self-attach, attach-to-self and
>   attach-pair; none moved the SOURCE Aura onto the TRIGGERING creature. One atom (attach-source-to-triggering) reads
>   ctx.triggeringPermanentId at resolution (CR 608.2): the source must still be on the battlefield, the creature too, and
>   the creature must satisfy the Aura's OWN Enchant line (auraEnchantHostSpec + the shared restriction satisfier — CR
>   303.4: an "Enchant creature you control" Aura never lands on an opponent's creature even when its trigger fired on
>   it). The "you may" pauses on the existing optional-effect choice; the pay-{1} form rides the optional-mana-payment
>   lane untouched. The Aura-own trigger validator vouches for both lines through permanentTriggersCovered, so the bonus
>   parse skips them and the runtime fires them off the Aura.
> · **Pins:** both payoffs (the atom under `optional`; the optional-mana-payment wrapper); both cards native. RUNTIME
>   through checkEnterTriggers + flush: Shielded by Faith fires on your creature AND an opponent's (accept → the Aura sits
>   on the newcomer, the old host's attachments emptied; decline → it stays); the synthetic "Enchant creature you control"
>   twin fires on an opponent's creature but accepting moves NOTHING (the restriction refuses); Brilliant Wings fires only
>   on your creature, paying {1} taps the Island and moves it, declining leaves it. Mutants: the arm gone, the restriction
>   ignored, the target swapped for the host, the resolver unregistered — mutants 4/4 killed.
> · **Whole-card:** two unplanned gains audited whole-card — Illusory Gains (the control-Aura line + the same watcher scoped to an opponent's creature, MANDATORY: the atom without the optional wrapper) and Prison Term (the pacifism-plus-activation-lock line + the optional form) — each other line native before today. A CREED park guard GRADUATED: flashAuraAndCondUnblock.test.js had pinned Illusory Gains as the 'flash + unmodeled clause still parks' example; it is the positive half now and the negative keeps a REAL unmodeled subject (Pariah's damage redirection — no redirection-to-permanent replacement exists).
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Light-Paws 76 → **78** (78/100; 7 to the bar). Next: Enter the Avatar State (the becomes-a-subtype-and-gains pump; the arm is built, the splitter needs its keep-whole guard), then Daybreak Coronet (S — the with-another-Aura Enchant restriction), then Sentinel's Mark (M — the Addendum main-phase look-back).

> ## 🎯 2026-09-05 (cron) — Phase 2 · L4: FACE OF DIVINITY + SHARDMAGE'S RESCUE — the conditional attached bonus · **+2** · corpus 14,612 (42.7%) / 34,245
> Suite **1557 files / 16,356** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 6/6 killed.**
> · "As long as another Aura is attached to enchanted creature, it has first strike and lifelink." / "As long as this Aura
>   entered this turn, enchanted creature has hexproof." The during-your-turn attachment bonus had already shown the shape
>   (strip a condition, run the rest through the existing attached-clause parser, stamp a gate the layer engine re-evaluates
>   every derive pass); these two conditions differ in needing the SOURCE Aura — to exclude itself from "another", to read
>   its own entry turn. The attached-bonus parse is per CARD and memoized, so no id can live in it: the gate carries
>   `needsSource`, and layers.staticEffectsOf stamps `sourcePermanentId` where the bonus is fixed to its host. Two gate
>   kinds in gateMet: another Aura on the host (the isEnchanted scan minus the source) and the source's enteredOnTurn
>   against the live turn (an unstamped source reads closed — a safe FN). Keyword grants only, all-or-nothing (a P/T form
>   under either condition would need the gated P/T twin and is refused). The classifier's Aura residue walk gained the
>   matching allowance, vouched for by the all-or-nothing whole-card parse.
> · **Pins:** both parses (the plain pump + gated keyword grants, the gate kinds); both cards native. RUNTIME through the
>   layer engine: Face of Divinity alone → 4/4 and NO first strike; with a second Aura on the host → 5/5 with first strike
>   + lifelink; Shardmage's Rescue that entered THIS turn → hexproof; the same Aura from an earlier turn → +1/+1 only.
>   Mutants: each arm gone, the gate counting its own Aura, the gate ignoring the turn, the source stamp dropped, the
>   classifier allowance dropped — mutants 6/6 killed.
> · **Whole-card:** no unplanned gains — both conditional lines print on these two cards alone.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Light-Paws 74 → **76** (76/100; 9 to the bar). Next: Shielded by Faith + Brilliant Wings in ONE slice (attach-on-enter Auras — the source Aura moves onto the triggering creature).

> ## 🎯 2026-09-05 (cron) — Phase 2 · L5: KARAMETRA'S BLESSING — the enchanted-or-enchantment-creature rider · **+1** · corpus 14,610 (42.7%) / 34,245
> Suite **1556 files / 16,353** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 5/5 killed.**
> · "Target creature gets +2/+2 until end of turn. If it's an enchanted creature or enchantment creature, it also gains
>   hexproof and indestructible until end of turn." The bound type-conditional pump existed (Blacksmith's Skill's "If it's
>   an artifact creature, it gets +2/+2" — the recipient is the previous atom's target, the condition read at resolution);
>   this rider is a KEYWORD grant under an OR condition. One arm beside it: the granted keywords through the shared
>   parseGrantedKeywords vocabulary, the condition as `ifBoundEnchantedOrEnchantmentCreature`; applyPumpEffect reads it at
>   resolution (CR 608.2) — the target has an Aura attached (hasAuraAttached, the same predicate Winds of Rath and Greater
>   Auramancy read) OR carries both Enchantment and Creature after layer 4 — and skips the grant otherwise, the +2/+2 having
>   already landed from the first atom. ⭐ THE SPLITTER WAS THE SECOND SEAM: the first cut parsed LOW whole-card while the
>   arm matched in isolation — splitClauses shattered "gains hexproof and indestructible" on its internal " and " inside the
>   leading-if sentence (the keep-whole guards were anchored on "target …"/pronoun subjects). One more keep-whole guard for
>   this exact sentence shape; the Tamiyo's Safekeeping note in that file names the same lesson — when a parser works alone
>   but not through its driver, the driver is doing something to the input.
> · **Pins:** two atoms (the targeted pump; the bound rider with both keywords and the flag); native-spell. RUNTIME through
>   the real cast on three targets: a creature wearing an Aura → 5/5 with hexproof + indestructible; an enchantment
>   creature → 4/4 with both; a plain creature → 4/4 and NO keywords. Mutants: the arm gone, the condition gate gone, the
>   enchantment-creature branch gone, the Aura branch gone, the splitter guard gone — mutants 5/5 killed.
> · **Whole-card:** no unplanned gains — the rider prints on Karametra's Blessing alone.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Light-Paws 73 → **74** (74/100; 11 to the bar). Next: Face of Divinity + Shardmage's Rescue in ONE slice (the conditional attached-bonus gate — the during-your-turn arm's shape with two new gate kinds).

> ## 🎯 2026-09-05 (cron) — Phase 2 · L5: DRANNITH MAGISTRATE — the cast-from-hand-only lock · **+1** · corpus 14,609 (42.7%) / 34,245
> Suite **1555 files / 16,349** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · "Your opponents can't cast spells from anywhere other than their hands." The existing opponents-can't-cast lock (Grand
>   Abolisher's family) is a during-your-turn WINDOW on every cast; Drannith's is ALWAYS ON and ZONE-scoped. Same marker
>   pattern (`castFromHandOnlyForOpponents`, its own exact-line reader beside castsPerTurnLimitOf — one parser, no drift),
>   and ONE post-filter after the cast block: for a player who is an opponent of any seat whose BATTLEFIELD holds the lock
>   (CR 113.6 — a commander carrying it imposes nothing from the command zone), every cast-family action whose `fromZone` is
>   not "hand" is withheld — flashback and other graveyard casts, exile casts (adventure step 2, plot, suspend, impulse,
>   discover), the COMMAND-zone commander cast (Drannith's famous bite), the library-top cast. Land plays are not casts and
>   stay. The controller's own casts are untouched.
> · **Pins:** the marker; the reader; Drannith native. RUNTIME through the real offer: a flashback instant in the opponent's
>   graveyard is offered on a bare board and WITHHELD with the Magistrate on the other seat's battlefield, while the same
>   player's hand cast stays offered; the Magistrate's own controller keeps the flashback. Mutants: the marker gone, the
>   reader blind, the lock binding its own controller, the filter forgetting the zone — mutants 4/4 killed.
> · **Whole-card:** no unplanned gains — the always-on hand-only line prints on Drannith alone (Avatar's Wrath prints a temporary form and stays parked).
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Light-Paws 72 → **73** (73/100; 12 to the bar). Next Light-Paws M row: Karametra's Blessing (a bound keyword rider under the enchanted-or-enchantment-creature condition — the Blacksmith's Skill shape).

> ## 🎯 2026-09-05 (cron) — Phase 2 · L5: DEAFENING SILENCE — the noncreature cast limit · **+1** · corpus 14,608 (42.7%) / 34,245
> Suite **1554 files / 16,346** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · "Each player can't cast more than one noncreature spell each turn." Rule of Law's marker and gate existed (castLimit;
>   spellsCastThisTurn ≥ 1 suppresses every cast lane), and so did the noncreature subset counter (Esper Sentinel's
>   noncreatureSpellsCastThisTurn — the same cast chokepoint, the same untap reset). Missing: the marker's `noncreatureOnly`
>   reading (its own exact-line reader beside castsPerTurnLimitOf — one parser, no drift) and a gate that limits NONCREATURE
>   casts while leaving creature spells offered. Every cast lane emits kind "cast-spell" (the dispatcher's single cast
>   handler), so ONE post-filter after the cast block covers hand / command / graveyard / exile / adventure / split casts
>   alike. The spell's type is the FACE being cast when the action carries one (an adventure's sorcery half is noncreature
>   though the card's front is a creature — CR 715.3), else the card resolved from the player's zones by id; an
>   unresolvable card is withheld (fail closed — a safe under-offer, never a second noncreature spell).
> · **Pins:** the marker, both readers, Rule of Law byte-identical, both native-static. RUNTIME through the real offer: a
>   fresh turn offers bear + instant + sorcery; after the instant is REALLY cast and resolved (the counter reads 1) only the
>   bear is offered; the same board without the static keeps offering the sorcery; an adventurer in hand — fresh: both halves
>   offered; after a noncreature cast: the CREATURE half stays, the sorcery half is withheld; Rule of Law withholds everything.
>   Mutants: the marker gone, the reader blind, the filter withholding creatures too, the filter judging the card instead of
>   the face — mutants 4/4 killed.
> · **Whole-card:** no unplanned gains — the noncreature form prints on Deafening Silence alone; Rule of Law, Arcane Laboratory, Eidolon of Rhetoric, Archon of Emeria and High Noon keep their own arm untouched (pinned byte-identical).
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Light-Paws 71 → **72** (72/100; 13 to the bar). Next Light-Paws M row: Drannith Magistrate (the cast-from-hand-only lock on opponents — the same post-filter shape, keyed on fromZone).

> ## 🎯 2026-09-05 (cron) — Phase 2 · Q4: ENDLESS FOOT ASSAULT — per-opponent attacking tokens · **+1** · corpus 14,607 (42.7%) / 34,245
> Suite **1553 files / 16,343** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · "Whenever you attack, for each opponent, create a 1/1 black Ninja creature token that's tapped and attacking that
>   player." The tapped-and-attacking token existed on a COUNT (Otharri's mobilize shape) but every minted token joined
>   combat against the TRIGGER's single defender; this card names each token's OWN defender. One parser arm
>   (`perOpponent`) and two runtime reads in applyCreateToken: the count is the live opponent count at resolution
>   (CR 608.2h — zero opponents, zero tokens), and the i-th minted token is appended to combat.attackers against the i-th
>   opponent (round-robin under a token doubler, so every copy still attacks a player). The trigger's defender is never
>   consulted for this shape. Adeline's "that player or a planeswalker that player controls" is a CHOICE the arm does not
>   read — it parks (CREED); Ainok Strike Leader's "attack with this creature and/or your commander" event stays parked on
>   its own trigger.
> · **Pins:** the atom (perOpponent, tapped, entersAttacking); Endless Foot Assault native-trigger (Squad already native).
>   RUNTIME — a THREE-seat table: the you-attack trigger mints two Ninjas, one tapped token in combat.attackers against
>   EACH opponent (distinct defenders), neither against the caster; a TWO-seat table mints one. Mutants: the arm gone, the
>   count fixed at one, every token sent at the first opponent, the tokens untapped — mutants 4/4 killed.
> · **Whole-card:** no unplanned gains. Adeline, Resplendent Cathar (the planeswalker-choice form) and Ainok Strike Leader (an 'attack with this creature and/or your commander' event) print the same token sentence and stay parked on their own seams.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Halfshell 82 → **83** (83/100; 2 to the bar) — HALFSHELL CEILING for Phase 2: every remaining row sizes L (noted in §5.10). The §5 order moves to Light-Paws (71; every row M+): Deafening Silence first (the noncreature variant of the Rule of Law cast limit — the per-player noncreature cast count already exists).

> ## 🎯 2026-09-05 (cron) — Phase 2 · Halfshell: FAST FORWARD — mass goad + the attacked-opponents discount · **+10** · corpus 14,606 (42.7%) / 34,245
> Suite **1552 files / 16,340** green; lint 0. Flip-diff **+10, zero LOST** (any unplanned gains audited whole-card). **mutants 6/6 killed (the stripper mutant survived its first run and got its test — the Ghoultree pin).**
> · "This spell costs {1} less to cast for each opponent you attacked this turn. Goad all creatures your opponents control."
>   Two arms. (1) MASS GOAD: goad knew a target and a bound pronoun, never the mass form — one arm on the every-opponent-
>   creature scope (atomTargets enumerates it at resolution, CR 608.2h); applyGoad's per-target loop and its
>   until-your-next-turn duration are untouched (Taunt from the Rampart and Kaima print the same sentence). (2) THE COUNT:
>   "opponents you attacked this turn" is a SEAT-level look-back — the declare-attacker chokepoint (the one place an attack
>   is declared; the Raid flag and Boast's per-permanent memo already live there) now stamps the seat's distinct defenders,
>   the untap reset clears the memo beside the Raid flag, and countForSpec counts the DISTINCT LIVE OPPONENTS among them
>   (a planeswalker defender id is not a player and never counts; two attackers into the same opponent count once). The
>   per-each self-cost metric reuses parseSelfCountSource — one vocabulary, one evaluator — and the coverage stripper's
>   self-cost sentence learned the per-each frame, gated (as every use is) on the metric parsing.
> · **Pins:** the mass goad atom; the metric { perEachCount, per 1, opponentsAttackedThisTurn }; Fast Forward native-spell;
>   Taunt from the Rampart still parked (its "can't block" sentence); GHOULTREE native-body — a permanent whose only text is a
>   per-each self-cost sentence, the coverage-side half (this pin was ADDED after the stripper mutant SURVIVED its first
>   run: a spell is credited through castModifiers' own strip, so only a permanent can see the classifier's frame).
>   RUNTIME — cast-price through the real offer: two attackers declared into the same opponent → the seat memo holds that
>   opponent once, the cast costs {3}{R} (one distinct opponent), a planeswalker defender stamped beside it adds nothing;
>   no attack → {4}{R}; after the untap reset → {4}{R} again. Resolving goads every opponent creature (goaded + mustAttack
>   through the layer reader) and none of the caster's own. Mutants: the mass arm gone, the count arm gone, the evaluator
>   counting every stamp, the chokepoint stamp dropped, the untap reset dropped, the coverage stripper reverted — mutants 6/6 killed (the stripper mutant survived its first run and got its test — the Ghoultree pin).
> · **Whole-card:** nine unplanned PERMANENT gains, all the Karador family — a per-each self-cost sentence the cast path has priced since Karador, parked only because the classifier's stripper had no per-each frame: Ghoultree and Cryptic Serpent (the sentence alone), Writhing Necromass (+ deathtouch), Tolarian Terror (+ ward), Ore-Scale Guardian (+ flying, haste), Bedlam Reveler (+ prowess + the discard-hand-draw ETB), Rumbleweed (+ the team pump ETB), Cinderslash Ravager (its 'permanent you control with oil counters' count + the ETB ping), Cyan (+ double strike + the leave-graveyard counter trigger) — each other line native before today. Taunt from the Rampart and Kaima print the mass goad too and stay parked on their own second sentences.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Halfshell 81 → **82** (82/100; 3 to the bar). Remaining Halfshell: Endless Foot Assault (M+ — per-opponent tokens each attacking THAT opponent; next), the rest L.

> ## 🎯 2026-09-05 (cron) — Phase 2 · Q4: MOLE MODULE — the milled-pick's battlefield destination · **+2** · corpus 14,596 (42.6%) / 34,245
> Suite **1551 files / 16,336** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 5/5 killed.**
> · "Whenever this Vehicle deals combat damage to a player, mill four cards. You may put a permanent card from among them
>   onto the battlefield." The HAND form (Ripples of Undeath, Six) already owned the machinery — the candidate set is the
>   mill's `_lastMilledIds` stamp ∩ the controller's live graveyard (CR 608.2b), one candidate moves directly, two or more
>   pause on the milled-pick choice. The battlefield destination reuses all of it under a sibling op
>   (pick-milled-to-battlefield, same resolver) and ENTERS the pick through enterCardFromZone — ETBs fire, a walker gets
>   its loyalty — at both the direct path and the pause's settle (toZone "battlefield"). "permanent" is the CR 110.4a gate
>   (a positive front-face permanent type), not a group word; an instant/sorcery-filtered or unfiltered battlefield form
>   parks (a non-permanent can't be put onto the battlefield); "a permanent card … into your hand" is unprinted and parks.
>   ⛔ AURAS ARE WITHHELD for the battlefield destination: entering un-cast an Aura must choose what it enchants (CR 303.4f)
>   and this path has no such choice — it would land unattached. Withholding is a documented UNDER-offer (the Academy
>   Rector refusal, applied to a pick). The hand form is byte-identical (Ripples' atom pinned).
> · **Pins:** mill + the battlefield pick (permanentOnly, optional); the three refusals; Ripples unchanged; Mole Module
>   native-trigger (Menace + Crew 2 already native). RUNTIME — a bear, an instant, an Aura and a rock milled: the pause
>   offers ONLY the bear and the rock; picking the bear ENTERS it (a permanent on the battlefield, gone from the graveyard),
>   the rock, the Aura and the instant stay milled; three instants and a rock: no pause, the rock enters directly; four
>   instants: no pause, nothing enters, all four stay milled. Mutants: the arm refusing the destination, the permanent gate
>   dropped, the Aura exclusion dropped, the settle demoted to a plain zone move, the direct path sent to hand — mutants 5/5 killed.
> · **Whole-card:** Bramble Familiar // Fetch Quest (unplanned gain) — the adventure face "Mill seven cards. Then put a creature, enchantment, or land card from among the milled cards onto the battlefield." rides the same pick with a type-union filter (mandatory, no 'you may'); an Aura among the milled cards is withheld exactly as on Mole Module (the enchantment word admits only non-Aura enchantments to the battlefield); the creature face (a mana ability + a discard-bounce ability) was native already.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Halfshell 80 → **81** (81/100; 4 to the bar). Remaining Halfshell rows: Fast Forward (M — a MASS goad arm + a per-opponent-attacked cast discount: two arms, next), Endless Foot Assault (M+ — per-opponent tokens each attacking THAT opponent), the rest L (Coin of Mastery, Special Move, Everything Pizza, Turtle Lair, Heroes in a Half Shell, Together Forever, Shellshock, Raphael the Muscle, Bebop, Tempestra, Double Jump).

> ## 🎯 2026-09-05 (cron) — Phase 2 · Q3: RAPHAEL, FIENDISH SAVIOR — the from-anywhere graveyard look-back · **+2** · corpus 14,594 (42.6%) / 34,245
> Suite **1550 files / 16,332** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · "At the beginning of each end step, if a creature card was put into your graveyard from anywhere this turn, create a
>   1/1 red Devil creature token with …" The payoff parsed; the trigger parked on its intervening-if, outside the reader's
>   vocabulary. It is a LOOK-BACK, not a graveyard read — the card may have left the graveyard again (reanimated, exiled)
>   and the condition still holds — so the fact is recorded where it happens: gameState.moveCardToZone stamps a per-PLAYER
>   turn mark (`creatureCardToGraveyardTurn`) on the graveyard's OWNER at the one graveyard chokepoint, so every path
>   (dies, discard, mill, a countered creature spell) records it. CARDS only — a token is not a card (CR 111.1) — whose type
>   line carries Creature, and only after the shuffle-instead replacement has had its say (a card that never reached the
>   graveyard leaves no record). The reader (interveningIf) compares the stamp to the live turn; no reset needed.
> · **Pins:** the end-step descriptor carries the condition; interveningIfParseable reads it; Raphael native-mixed.
>   RUNTIME — a creature card MILLED this turn stamps turn 4, the condition reads true, ONE end-step trigger fires and
>   the Devil token is created; a creature card that DIED through the lethal pipeline stamps too, and the record survives
>   the card being exiled out of the graveyard again (the Devil still comes); NO Devil on an untouched board, on a TOKEN
>   creature dying (stamp stays null), on an INSTANT milled (stamp stays null), or on a stamp from the PREVIOUS turn — the
>   trigger is queued and the flush withholds it (CR 603.4), stack empty after.
>   Mutants: the reader arm gone, the token check dropped, the creature-type check dropped, the turn compare dropped — mutants 4/4 killed.
> · **Whole-card:** Cloakwood Hermit (unplanned gain) — a Background granting commander creatures you own the SAME conditional end-step trigger (two tapped Squirrels) through the quoted-grant static lane; only the condition's readability changed, so it flips on this reader alone. Macabre Reconstruction prints the condition on a conditional cast discount and did not move (its tier was unchanged by this slice).
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Halfshell UNCHANGED at 80 — ⚠️ MIS-AIMED ROW: the Q3 row's bare 'Raphael' is Raphael, the Muscle (a Mutant Ninja Turtle: a counters-filtered damage doubler — sized L, no doubling machinery — + a Mutagen ETB + Partner—Character select); I read it as Fiendish Savior. The +2 is corpus-only. Lesson: resolve a bare name against the deck's leftovers dump BEFORE sizing (the runbook row now names the Muscle in full). Next Halfshell M row = Mole Module (the milled-pick's battlefield destination — the hand form's machinery exists).

> ## 🎯 2026-09-05 (cron) — Phase 2 · Q4: EXPLODING BARREL — the per-counter activation discount · **+4** · corpus 14,592 (42.6%) / 34,245
> Suite **1549 files / 16,328** green; lint 0. Flip-diff **+4, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · "{8}, {T}, Sacrifice this artifact: It deals 20 damage to target creature. This ability costs {1} less to activate for
>   each pressure counter on this artifact." The mana line was native; the sacrifice ability parked on its trailing rider —
>   a COST modifier sitting in the effect text, dragging the whole clause LOW. The ability parser now peels the frame
>   "This ability costs {N} less to activate for each <kind> counter on this <noun>." (after the condition rider, before the
>   limit rider, so a limit printed ahead of it keeps its end anchor) into `reduction.perCounterOnSelf`, and the offer
>   (legalChoices.actionsActivateAbility) prices the ability FIRST through one reducer that reads the source's own
>   counter bag for exactly the named kind — generic only, floored at {0} (CR 601.2f) — before the static reducers and
>   the affordability gate. The action carries the priced cost; the dispatcher pays exactly that, so offer and payment
>   cannot disagree. The channel lands' legendary-count rider keeps its own reader (a different count source). Any
>   other "costs … less" rider still parks the ability — never a silent discount, never a silent full price.
> · **Pins:** two abilities parsed, the sacrifice one carrying `{ perCounterOnSelf: { kind: "pressure", amount: 1 } }` with
>   its effect text clean; a "for each artifact you control" rider still parks; the reducer alone (3 pressure + 2 charge →
>   {5}; charge only → {8}; 10 pressure → {0}; no rider → {8}). RUNTIME through the real offer + dispatcher: three
>   pressure counters and five Forests → ONE action at generic 5 targeting the opponent's 5/5; resolving kills it and
>   the Barrel is in the graveyard; zero counters + five Forests → the printed {8} is unaffordable, nothing offered; ten
>   counters and NO lands → offered at {0}. Mutants: the peel gone, the offer ignoring the reduction, the floor gone,
>   the reducer counting every kind — mutants 4/4 killed.
> · **Whole-card:** Quest for the Necropolis (a landfall quest-counter trigger + the sacrifice reanimate, both already modelled; the rider was the park), Vindictive Flamestoker (the noncreature-cast oil trigger + the discard-hand-draw-four sacrifice ability), Diary of Dreams (the instant-or-sorcery page trigger + the draw) — each parked on this rider ALONE, all other lines native before today. The first cut's end-anchored regex missed every REAL carrier (the printed rider sits BEFORE 'Activate only as a sorcery.' on the Barrel and the Quest — my truncated probe had hidden the tail); the peel is sentence-anchored and the timing rider is pinned to survive it.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Halfshell 79 → **80** (80/100; 5 to the bar) — next Halfshell M row = Raphael, Fiendish Savior (a per-player 'creature card put into your graveyard this turn' flag + one condition reader; the payoff already parses).

> ## 🎯 2026-09-05 (cron) — Phase 2 · A3: MUTATIONAL ADVANTAGE — the group shield on "those permanents" · **+1** · corpus 14,588 (42.6%) / 34,245
> Suite **1548 files / 16,323** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · "Permanents you control with counters on them gain hexproof and indestructible until end of turn. Prevent all damage
>   that would be dealt to those permanents this turn. Proliferate." Three sentences, one anaphora, one composite matcher
>   (Inspiring Call's shape). The grant is Baxter's counter-filtered group grant on the PERMANENT scope (Heroic
>   Intervention's scope, "any counter"). The shield is the existing all-damage prevention shield with a `group`
>   selector: applyPreventNextDamage enumerates the counter-bearing permanents you control AT RESOLUTION (CR 611.2c — the
>   same live read the grant makes; nothing changes between the two sentences, the proliferate comes after both) and
>   writes one entry per creature and per non-creature planeswalker — the only permanents damage can reach (CR 120.1);
>   an artifact with a charge counter gets no vacuous entry. Proliferate is its own deterministic atom (never-harmful
>   picks). Whole-clause anchored: the single-sentence grant alone still parks (no spell prints it; Innkeeper's Talent's
>   is a static "have ward {1}").
> · **Pins:** three atoms in order with the filters and the group selector; the single sentence low; native-spell.
>   RUNTIME — cast through legalActions/dispatch/resolve on a mixed board: the countered creature and the walker gain
>   hexproof + indestructible (layer reader) and hold shields ("creature:cnt", "planeswalker:walker"); the counterless
>   creature, the opponent's countered creature, and the charged rock get neither; proliferate adds one to the bear's
>   +1/+1, the walker's loyalty and the rock's charge, none to the counterless bear or the opponent's; then the REAL
>   consumer — consumePreventionShields — prevents all 7 to the bear and the walker, none of the 7 to the counterless
>   bear. Mutants: the composite gone, the shield's counter filter dropped, the walker entries dropped, the grant's
>   filter dropped — mutants 4/4 killed.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Atraxa 73 → **74** (74/100; 11 to the bar) — ATRAXA CEILING for Phase 2: every remaining row now sizes L (Interplanar Beacon, Ashiok, Kiora — resized L today: an until-your-next-turn shield expiry plus a source-side 'dealt by' prevention — and the A5 loyalty-vocabulary sweep); the §5 order moves to Halfshell's M rows (Exploding Barrel first — only its per-counter activation discount rider parks it).

> ## 🎯 2026-09-05 (cron) — Phase 2 · A3: ARENA RECTOR — "if you do" exile-self + the walker fetch onto the battlefield · **+2** · corpus 14,587 (42.6%) / 34,245
> Suite **1547 files / 16,320** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 3/3 killed (a 4th survived and its redundant guard word was deleted).**
> · "When this creature dies, you may exile it. If you do, search your library for a planeswalker card, put it onto the
>   battlefield, then shuffle." Two seams, one card. (1) The optional-exile-self payment (Undead Butler's lane) anchored
>   on "When you do" only; the conditional "If you do" has the same runtime — the exile IS the cost, paid at settle by a
>   real graveyard → exile move, the payoff only on that move (CR 603.7 / CR 117.12) — so the matcher reads both words,
>   while the chained-clause guard keeps its single word — a chained "If you do" is already refused by the payoff
>   gate (the bare back-reference parses LOW on its own). (2) The battlefield tutor's admission list (bare permanent ·
>   land · creature) gains a GUARANTEED-PLANESWALKER arm: enterCardFromZone stamps a walker's entry loyalty from any zone
>   (the Deploy the Gatewatch slice), so the list was the only gate. Enchantments stay OUT on purpose — an Aura entering
>   un-cast must choose what it enchants (CR 303.4f), the battlefield path offers no such choice, and admitting "an
>   enchantment card" (Academy Rector) would land an Aura unattached: the wrong-cheat FP the CREED forbids.
> · **Pins:** the whole clause parses to ONE pausing wrapper with the walker tutor nested (targetType null — nothing to
>   lock at flush); the "If you do" graveyard-return form (Greenwarden) parses with the self-exclusion stamp; a chained
>   second "If you do" nulls; the enchantment battlefield fetch stays low and Academy Rector parks; RUNTIME — the Rector
>   dies through the lethal pipeline, the flush pauses on the exile choice (available, cardId set); PAY moves it to exile
>   and opens a tutor-search offering ONLY the planeswalker (the bear in the same library is never a candidate); the pick
>   enters the battlefield with loyalty 6 and the bear stays in the library; DECLINE leaves everything put; a Rector that
>   vanished mid-pause pays nothing and no search opens. Mutants: the wording reverted, the walker arm gone, the walker
>   arm relaxed to any typed group — mutants 3/3 killed (a 4th survived and its redundant guard word was deleted). **A fourth mutant SURVIVED and was acted on:** the first cut also taught the
>   chained-clause guard the word "if"; reverting that word changed nothing, because the payoff gate already refuses a
>   chained "If you do" on its own — the redundant word was deleted (the guard is back to "when"), the chained pin stays
>   as the seen-to-fail witness of the gate that actually does the work.
> · **Whole-card:** Greenwarden of Murasa (unplanned gain) — its ETB "you may return target card from your graveyard to
>   your hand" was already modelled; the dies line was the parked half. The Legend of Arena (Saga, chapter III carries
>   the same fetch) does not flip — its chapters park elsewhere; The Master, Gallifrey's End and the other eleven
>   dies-may-exile carriers keep parking on their own payoffs (copies-as-tokens, Spirit-typed returns, top-of-library).
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · Atraxa 72 → **73** (73/100; 12 to the bar) — its remaining rows are M+/L; next = A3 Mutational Advantage (M: the counters-scoped PERMANENT grant + the group all-damage shield on those permanents + proliferate).

> ## 🎯 2026-09-05 (cron) — Phase 2 · L4: GAUNTLETS OF LIGHT — the toughness-assigns attached grant · **+2** · corpus 14,585 / 34,245
> Suite **1546 files / 16,315** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 3/3 killed.**
> · "Enchanted creature gets +0/+2 and assigns combat damage equal to its toughness rather than its power." The self and
>   team printings of the toughness-assigns sentence already emit a layer-6 op combat resolution reads layer-aware
>   (assignsCombatDamageWithToughness); the AURA form had no attached-clause arm, so the Aura's whole bonus dropped and
>   the card parked. One arm in the attached-clause core (the capped-blockers arm's shape): the pump plus the same op,
>   both fixed to the host by the attached-bonus path — they arrive with the Aura and leave with it. Whole-clause
>   anchored: Solid Footing's conditional "as long as enchanted creature has vigilance" form never matches.
> · **Pins:** the two-effect bonus; the plain +0/+2 Aura's single effect; Solid Footing still parked; Gauntlets native;
>   RUNTIME — a 1/3 under Gauntlets reads toughness 5 and assigns 5 through the layer engine; under a plain +0/+2 Aura it
>   reads 5 and assigns its power. Mutants: the arm gone, the op dropped, the pump dropped — mutants 3/3 killed.
> · **Whole-card:** the printed Gauntlets carries a THIRD line — Enchanted creature has "{2}{W}: Untap this creature." —
>   the activated-grant Aura lane already covers it, so the card lands native-activated (the lane's tier), all three lines
>   modelled. **Unplanned gain audited whole-card:** Treefolk Umbra — the same pump-plus-op line beside umbra armor (the
>   modelled totem-armor replacement).
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Light-Paws 70 → **71** (14 to the bar) — LIGHT-PAWS' S ROWS DONE; every remaining row sizes M+ (Karametra's Blessing's enchanted-or-enchantment rider, Face of Divinity / Solid Footing's as-long-as conditionals, Deafening Silence's per-turn cast count, Drannith's cast-zone lock, Umbra Mystic's granted umbra armor, Shielded by Faith / Brilliant Wings' re-attach ETBs, Sentinel's Mark's addendum, Celestial Mantle's life doubling, Light-Paws itself) or L (Mantle of the Ancients, With Great Power, Enter the Avatar State, Ishgard, the L6 composite)

> ## 🎯 2026-09-05 (cron) — Phase 2 · L4: GREATER AURAMANCY — the enchanted-creatures selector · **+1** · corpus 14,583 / 34,245
> Suite **1545 files / 16,313** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · "Enchanted creatures you control have shroud." The team shield static knew four permanent-type subjects (artifacts /
>   enchantments / lands / planeswalkers you control have hexproof or shroud); this one is the creature subject with the
>   ENCHANTED qualifier — the same predicate Winds of Rath's restriction reads (an Aura attached, whoever controls it,
>   CR 303.4), here as a LAYER SELECTOR gate beside the modified gate, re-evaluated live by the layer engine so the
>   shroud arrives with the Aura and leaves with it. Only hexproof and shroud, as before.
> · **Pins:** the descriptor's selector; the plain "creatures you control have shroud" form untouched (it has its own
>   lane); Greater Auramancy native; RUNTIME — your enchanted creature reads shroud, your bare creature and your equipped
>   creature do not, an opponent's enchanted creature does not; attaching an Aura mid-board turns the shroud on.
>   Mutants: the arm gone, the selector losing its gate, the layer ignoring the gate, the layer read counting any
>   attachment — mutants 4/4 killed.
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Light-Paws 69 → **70** (15 to the bar)

> ## 🎯 2026-09-05 (cron) — Phase 2 · L5: WINDS OF RATH — the enchanted predicate · **+1** · corpus 14,582 / 34,245
> Suite **1544 files / 16,311** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed (one survivor got its missing test).**
> · Light-Paws opens (68, needs 17; the runbook's 61 was stale). "Destroy all creatures that aren't enchanted. They can't
>   be regenerated." The every-creature wipe with a restriction already ships and the regeneration rider is stripped and
>   stamped on the destroy atom; the PREDICATE was missing. ENCHANTED (CR 303.4) is a creature with an Aura attached —
>   whoever controls the Aura, unlike MODIFIED (which wants the controller's own Aura, or a counter, or Equipment). One
>   restriction kind reading the attached permanents for an Aura, negated here; one mass-destroy arm carrying it.
> · **Pins:** the atom with its negated restriction and the regeneration stamp; the bare form without the stamp; Winds
>   native; RUNTIME — through the real cast your enchanted creature AND the opponent's creature under YOUR Aura both
>   live, the bare creatures on both sides die. Mutants: the arm gone, the negation dropped (the enchanted ones die),
>   the kind restricted to the controller's own Aura, the kind counting any attachment (Equipment) — mutants 4/4 killed (one survivor got its missing test).
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Light-Paws 68 → **69** (16 to the bar)

> ## 🎯 2026-09-05 (cron) — Phase 2 · Q3: BAXTER, FLY IN THE OINTMENT — the counter-filtered group grant · **+1** · corpus 14,581 / 34,245
> Suite **1543 files / 16309** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 3/3 killed.**
> · "Whenever Baxter enters or attacks, each creature you control with a counter on it gains flying until end of turn."
>   The compound head, the draw-a-card counter trigger and the plain "creatures you control gain <kw>" grant were all
>   native; the FILTERED grant had no arm. The group keyword grant's resolver already carries a counter filter —
>   Inspiring Call's "those creatures" binds it with the kind "+1/+1" — so the filtered sentence is one whole-clause
>   matcher: it parses the unfiltered grant through the same allowlisted keyword path and stamps the filter with the
>   value "any", and the resolver reads "any" as at least one counter of any kind (the kind-string read unchanged).
>   Exactly this sentence; a counted variant ("with two or more counters") stays refused.
> · **Pins:** the atom (scope, keywords, the "any" filter); an un-grantable keyword refused; Baxter native; RUNTIME —
>   through the real ETB flush a creature with a charge counter gains flying, an unmarked one does not, an opponent's
>   marked creature does not; the +1/+1-kind filter (Inspiring Call) unchanged. Mutants: the matcher gone, the filter
>   stamped as "+1/+1" instead of "any" (a charge counter no longer qualifies), the resolver's "any" branch reading
>   every creature — mutants 3/3 killed.
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Halfshell 78 → **79** (6 to the bar) — HALFSHELL CEILING for Phase 2: every remaining row sizes M+ (Turtle Lair's subtype-union unblockable + spend words, Endless Foot Assault's per-opponent attacking tokens, Exploding Barrel, Mole Module, Coin of Mastery, Raphael, Special Move's two low modes) or L (Heroes in a Half Shell's plural subject list + batch referent, Foot Chopper / Bebop / Together Forever / Dimension X's if-you-do and reflexive lanes, Vigor, Krang, Shredder, Irma, Tempestra, Fast Forward, Shellshock, Double Jump); per §2.4 the order moves to Light-Paws (68)

> ## 🎯 2026-09-05 (cron) — Phase 2 · Q4: BIG APPLE, 3 A.M. — the opponent count · **+3** · corpus 14,580 / 34,245
> Suite **1542 files / 16,307** green; lint 0. Flip-diff **+3, zero LOST** (any unplanned gains audited whole-card). **mutants 3/3 killed.**
> · "{5}, {T}: Create a 1/1 black Rat creature token for each opponent you have." The land's enters-tapped, choose-a-colour
>   and chosen-colour mana lines were the LANDS-12 lane; the Rat line parked on its COUNT — "opponent(s) you have" was
>   not a count source (the same absence that sized Killer Service's ETB up in Bumble). One kind: the count-source
>   parser reads the exact phrase to `opponents`, and the shared evaluator answers it with the seat's live opponents
>   (opponentsOf — the same read every "each opponent" effect uses), so every for-each consumer (tokens, life, draw)
>   inherits it. Exactly the printed phrase; "each opponent" as a SCOPE is a different thing and untouched.
> · **Pins:** the spec; an unrelated phrase refused; Big Apple flips to land; RUNTIME — the ability offered with five
>   mana up and, activated in a four-seat game, three Rats; in a two-seat game, one. Mutants: the arm gone, the count
>   read as every player, the evaluator branch gone — mutants 3/3 killed.
> · **Unplanned gains audited whole-card:** Inspired Sphinx (flying + "draw cards equal to the number of opponents you have"
>   + a Thopter maker) and Chittering Witch (Rats equal to the number of opponents + a sacrifice-a-creature debuff) — the
>   "equal to the number of …" prefix strips before the count source, so the same kind serves them. Killer Service's ETB
>   reads it too now; its optional pay-and-sacrifice end step still parks the card (Bumble unchanged).
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Halfshell 76 → **78** across this and the Donatello slice (7 to the bar); Inspired Sphinx and Chittering Witch the unplanned gains, audited whole-card

> ## 🎯 2026-09-05 (cron) — Phase 2 · Q4: DONATELLO, THE BRAINS — the Took replacement's Mutagen printing · **+1** · corpus 14,580 / 34,245
> Suite **1542 files / 16,307** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 3/3 killed.**
> · "If one or more tokens would be created under your control, those tokens plus a Mutagen token are created instead."
>   Peregrin Took's profile (SG-10 — "those tokens plus an additional Food token") already models this replacement at
>   the mint chokepoint: one extra named token per creation event, never re-entering the replacement (CR 614.5). The
>   reader and its strip predicate anchored on the Food printing's exact article ("an additional Food"); Donatello
>   prints "a Mutagen" — the Mutagen token is already a registered named token (Shellshock's reminder text). Both
>   anchors admit the two printed articles and the two modelled kinds, and nothing else (an unregistered kind stays
>   refused — the mint would have nothing to mint).
> · **Pins:** the profile for both printings; an unregistered kind refused; Donatello native; RUNTIME — a Treasure made
>   under Donatello arrives with a Mutagen beside it, two Donatellos make two Mutagens, a token made by an opponent gets
>   none. Mutants: the reader's widening gone, the strip predicate not widened, the reader admitting any word — mutants 3/3 killed.
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Halfshell 76 → **78** across this and the Big Apple slice (7 to the bar); the shared suite run covers both

> ## 🎯 2026-09-05 (cron) — Phase 2 · Q4: SWIFT DEMISE — the opponent-creature mass destroy · **+1** · corpus 14,576 / 34,245
> Suite **1540 files / 16303** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · "Swift Demise deals 1 damage to target creature. Then destroy each creature you don't control that was dealt damage
>   this turn." The ping and the "then" sequence were modelled; "destroy all creatures that were dealt damage this turn"
>   already parsed HIGH (the shared dealtDamageThisTurn restriction — two witnesses, marked damage or a named dealer);
>   the mass BOUNCE family already enumerates "each creature you don't control" (eachOpponentCreature). Only the destroy
>   op lacked that scope: one arm, the bounce family's scope on the destroy op with the optional dealt-damage rider as
>   the restriction the enumerator already applies to every mass scope. Exactly these two sentences.
> · **Pins:** the atom (opponent-creature scope + the restriction) and the bare form without the rider; the whole two-
>   sentence program HIGH; Swift Demise native; RUNTIME — the ping marks the target and the destroy takes exactly the
>   opponent's damaged creatures: the pinged one dies, an undamaged opponent creature lives, your own damaged creature
>   lives. Mutants: the arm gone, the rider dropped (every opponent creature dies), the scope widened to every creature
>   (your own damaged creature dies) — mutants 4/4 killed.
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Halfshell 75 → **76** (9 to the bar); a resolution gap closed on the way — the opponent-creature sweep ignored the atom's restrictions

> ## 🎯 2026-09-05 (cron) — Phase 2 · Q5: LITA, LITTLE ORPHAN AMPHIBIAN — the period-form mode-memory lead · **+2** · corpus 14,575 / 34,245
> Suite **1539 files / 16,301** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 5/5 killed.**
> · "Alliance — Whenever another creature you control enters, choose one that hasn't been chosen this turn. / • Put a
>   +1/+1 counter on Lita. / • Create a Food token. / • Scry 1." Every mode was modelled and the per-turn mode ledger
>   (Teval's Judgment's MODE-MEMORY) already enforces "hasn't been chosen this turn" at the flush chooser. The card
>   parked on PUNCTUATION: the printed lead ends in a PERIOD with the bullets on the following lines, and both the
>   trigger's modal block extractor and the modal parser's mode-memory lead anchored on a DASH — the effect clause was
>   cut at the period and the bullets dropped. The period joins the dash at the three anchors (the lead, the scan, the
>   parser's memory lead). Three period-form carriers in the corpus beside nine dash-form ones. A SECOND seam surfaced
>   behind it: the self-name INSIDE a bullet ("put a +1/+1 counter on Lita") — the self-name rewrite is an allowlist of
>   whole-clause grammars (a global rename measured −25/−29 twice), so a modal block never met them. The assembly now
>   rewrites each bullet's BODY through the same allowlist with its period peeled and restored — one bullet at a time,
>   the same exact grammars, never a global rename. And a THIRD anchor on the metric side: coverage's own modal-block
>   stripper anchored on the dash too, so the period-form bullets stayed as residue and the Food bullet's reminder text
>   tripped the quote guard — widened the same way. Mutants: the lead, the scan, the parser's memory lead, the per-bullet
>   self-name rewrite, the coverage stripper — each not widened / removed.
> · **Pins:** the trigger's effect clause carries the whole bullet block; the program is a mode-memory modal with three
>   modes; the dash form unchanged; Lita native; RUNTIME — through the real flush chooser two entries in one turn pick
>   two different modes and a third entry has the last one. Mutants: the lead not widened, the scan not widened, the
>   parser's memory lead not widened — mutants 5/5 killed.
> · **Unplanned gain audited whole-card:** Titanium Man — a dash-form attack modal whose two bullets name the source
>   ("Titanium Man gains flying until end of turn" / "Titanium Man deals 1 damage to any target"), unlocked by the
>   per-bullet self-name rewrite alone.
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Halfshell 74 → **75** (10 to the bar); Titanium Man the unplanned gain, audited whole-card

> ## 🎯 2026-09-05 (cron) — Phase 2 · Q3: CASEY JONES, BACK ALLEY BRUTE — the active counters-placed damage payoff · **+1** · corpus 14,573 / 34,245
> Suite **1538 files / 16,299** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 3/3 killed.**
> · "Whenever you put one or more +1/+1 counters on a creature you control, Casey Jones deals that much damage to target
>   opponent." Menace and the attack trigger (a counter on target attacking creature) were native. The ACTIVE
>   counters-placed event ("whenever YOU PUT …", magnitude = ctx.countersPlaced) knew two payoffs — draw that many, gain
>   that much — while the damage payoff lived only on the PASSIVE event ("whenever one or more counters ARE PUT …",
>   Shalai and Hallar, magnitude = ctx.countersPutCount). The two events stay distinct (the assembly's standing rule);
>   the active event now rewrites the same printed payoff to its OWN unprintable sentinel ("counters-placed damage") and
>   the deal-damage parser maps that sentinel to the placed count — a twin arm, never a shared one, so neither event
>   can read the other's field and deal 0.
> · **Pins:** the rewrite and the atom's count context; the passive form unchanged; Casey native; RUNTIME — two counters
>   placed on a creature you control deal 2 to the targeted opponent, one counter deals 1, counters placed on an
>   opponent's creature deal nothing. Mutants: the assembly branch gone, the parser twin gone, the twin bound to the
>   passive count field (deals 0 on the active event) — mutants 3/3 killed.
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Halfshell 73 → **74** (11 to the bar); one suite guard graduated — countersPlaced had pinned Casey Jones as body-only by name (a ridered payoff stays pinned refused)

> ## 🎯 2026-09-05 (cron) — Phase 2 · Q3: RAY FILLET, WAVE WARRIOR — the with-a-counter dealer filter · **+3** · corpus 14,572 / 34,245
> Suite **1537 files / 16,296** green; lint 0. Flip-diff **+3, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · "Whenever a creature you control with a counter on it deals combat damage to a player, draw a card." Flying and evolve
>   were native; the trigger parked on the dealer's qualifier — the combat-damage family carves out precisely-checkable
>   dealer filters (a keyword, power above base) before a generic "with …" reject. "With a counter on it" is one more:
>   ANY counter kind, read LIVE off the dealing permanent at the fire site (the same per-dealer pass the power-above-base
>   filter uses), so an unmarked attacker connecting never fires it. Anchored to exactly this subject and the bare
>   player/opponent object.
> · **Pins:** the descriptor; a "with two or more counters" variant refused; Ray Fillet native; RUNTIME — a marked
>   attacker connecting fires the draw, an unmarked one connecting does not, a marked creature the opponent controls
>   does not. Mutants: the arm gone, the flag not honoured at the fire site (every dealer fires), the flag read off the
>   watcher instead of the dealer — mutants 4/4 killed.
> · **Unplanned gains audited whole-card:** Yathan Tombguard (menace + the same trigger with a draw-and-lose-1 payoff) and
>   Venus, Torn Between Worlds (an already-native dealt-damage-to-counters trigger + the same trigger with the modelled
>   optional-pay "you may pay {U}. If you do, draw a card" payoff).
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Halfshell 72 → **73** (12 to the bar); Yathan Tombguard and Venus, Torn Between Worlds the unplanned gains, audited whole-card

> ## 🎯 2026-09-05 (cron) — Phase 2 · Q3: TOKKA & RAHZAR + SPLINTER — the nontoken leaves scope · **+3** · corpus 14,569 / 34,245
> Suite **1536 files / 16,293** green; lint 0. Flip-diff **+3, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed (one survivor got its missing test).**
> · Halfshell opens (69, needs 16). "Whenever another nontoken creature you control leaves the battlefield, put a +1/+1
>   counter on Tokka & Rahzar and create a Treasure token. This ability triggers only once each turn." and Splinter's
>   "Whenever Splinter or another nontoken creature you control leaves the battlefield, create a Mutagen token." The
>   leaves family knew three subjects (a token you control / another creature you control / a creature you control);
>   both payoffs, the once-each-turn rider and the Mutagen token were already modelled. Two scopes join it: the
>   "another nontoken" form (the "another" arm with a token gate on the leaving permanent — card.token, the mirror of
>   the token scope) and the SELF-INCLUSIVE union "<Name> or another nontoken creature you control" (the source's own
>   leave arrives through the self look-back and fires it). The union's head must be the source — a stranger's name or
>   any other rider leaves residue and parks.
> · **Pins:** the descriptors for both shapes, a stranger-headed union refused; both cards native; RUNTIME — a nontoken
>   creature leaving fires Tokka (a counter and a Treasure), a second leave the same turn does not (once each turn), a
>   token leaving never does; Splinter's own bounce makes a Mutagen, a token leaving does not. Mutants: the "another
>   nontoken" arm gone, the union head unchecked, the token gate dropped, the self-inclusive scope excluding the
>   source — mutants 4/4 killed (one survivor got its missing test).
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Halfshell 69 → **72** (13 to the bar); Rat King, Pale Piper the unplanned gain, audited whole-card (menace + the same self-inclusive union making a Rat + a native sacrifice-a-token draw)

> ## 🎯 2026-09-05 (cron) — Phase 2 · GIFT ON SPELLS — the un-promised base mode · **+13** · corpus 14,566 / 34,245
> Suite **1535 files / 16,290** green; lint 0. Flip-diff **+13, zero LOST** (any unplanned gains audited whole-card). **mutants 3/3 killed.**
> · "Gift a card (You may promise an opponent a gift as you cast this spell. If you do, they draw a card before its
>   other effects.) / Counter target creature spell. If the gift was promised, instead counter target spell." (Long
>   River's Pull; Peerless Recycling and Wear Down the same shape.) GIFT (CR 702.174) is an OPTIONAL ADDITIONAL COST —
>   the kicker / offspring / squad family's exact reasoning: the engine never pays optional additional costs, so the
>   printed un-promised text IS the complete, real mode the spell resolves in. The "Gift a <X>" keyword line joins the
>   cost-only keyword strip, and the "If the gift was promised, …" sentence — a branch that can never be reached — is
>   stripped at the spell-program site before any whole-oracle matcher sees the text (so the "instead" hint never
>   routes it). Sentence-bounded: the sentence AFTER a promised rider survives. Twenty-four printed carriers; the
>   PERMANENT carriers ("Gift a tapped Fish / When this creature enters, if the gift was promised, …") are untouched —
>   their trigger's intervening-if is unreadable and parks, exactly as before.
> · **Pins:** the three Atraxa spells parse to their base programs (counter creature spell / return one permanent card /
>   destroy one artifact-or-enchantment) and classify native-spell; a following sentence survives the strip; a permanent
>   gift carrier stays parked; RUNTIME — Wear Down's cast offers one target per artifact/enchantment and resolves the
>   base destroy. Mutants: the keyword line not stripped, the promised strip gone, the strip eating the next sentence
>   — mutants 3/3 killed.
> · **Ten unplanned gains audited whole-card** (each: a modelled base line + an unreachable promised rider): Mind Spiral
>   (target player draws three), Wildfire Howl (2 to each creature), Pool Resources (draw two; its keyword line prints
>   without reminder text and strips the same), Perch Protection (four 2/2 fliers + the self-exile sentence), Blooming
>   Blast (2 to target creature), Valley Rally (+2/+0 team), Starfall Invocation (destroy all creatures), Into the Flood
>   Maw (bounce an opponent's creature), Crumb and Get It (+2/+2 to your creature), Sazacap's Brew (the discard
>   additional cost + target player draws two).
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · **CORRECTION (same session):** the gift trio lives in BUMBLE FLOWER's F8 composite, not Atraxa — Bumble 85 → **88**;
>   Atraxa is UNCHANGED at 72 (13 to the bar). The commit title "Atraxa 72 → 75" (209bb585) is wrong on the deck; the
>   corpus figures stand. ATRAXA CEILING REACHED for Phase 2 without the planeswalker sweep — every remaining row sizes M+ (Kiora's all-damage to-and-by shield, Arena Rector's dies-may-exile reflexive with no if-you-do machinery, Urza's Ruinous Blast's nonland-nonlegendary mass exile + the legendary-sorcery cast gate, Astral Cornucopia's count-derived colour-choice tap, Mutational Advantage's counters-scoped grant) or L (the two-plus-ability walkers, Innkeeper's Talent, Interplanar Beacon, Wedding Ring, the Oaths, Carth, Avatar's Wrath, Mechanized Production); per §2.4 those are noted in §5.9 and the §5 order moves to Halfshell (69)

> ## 🎯 2026-09-05 (cron) — Phase 2 · DUELING GROUNDS — the global combat cap · **+3** · corpus 14,553 / 34,245
> Suite **1534 files / 16,287** green; lint 0. Flip-diff **+3, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · "No more than one creature can attack each combat. / No more than one creature can block each combat." Nothing in
>   the engine capped a combat's headcount. The static parser now reads the sentence to a `combatCap` descriptor
>   (one or two; attack or block — the four printed forms: Dueling Grounds and Silent Arbiter at one, one card at two);
>   a board reader takes the LOWEST cap of its kind across every battlefield (the statics are symmetric — CR 508.1a /
>   509.1a restrictions on the whole combat, whoever controls the source); the attacker enumeration returns nothing
>   once that many attackers stand declared, the blocker enumeration once that many creatures block. Sequential
>   declaration makes the cap exact — the (N+1)th declare is never offered. The defender-scoped "No more than two
>   creatures can attack YOU each combat" (Crawlspace) is a different restriction and stays refused.
> · **Pins:** the descriptors for one/two × attack/block; Crawlspace's scoped form refused; Dueling Grounds and Silent
>   Arbiter native; RUNTIME — two ready creatures under Dueling Grounds: two declares offered, none after the first
>   lands; without it the second is still offered; two ready blockers: one block, then none; a one-cap beside a two-cap
>   reads one. Mutants: the arm gone, the attack gate dropped, the block gate dropped, the reader taking the highest
>   cap — mutants 4/4 killed.
> · **Unplanned gains audited whole-card:** Silent Arbiter (the same two lines on a 1/5 body) and Caverns of Despair (the
>   two-cap printing — a WORLD enchantment; the world rule, CR 704.5m, is a state-based action the engine does not
>   model for ANY world permanent, Concordant Crossroads included — a standing, pre-existing limitation of the tier
>   noted here rather than introduced by this slice; two world permanents on one board is a corner the shelf never
>   reaches).
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Atraxa 71 → **72** (13 to the bar); Silent Arbiter and Caverns of Despair the unplanned gains, audited whole-card

> ## 🎯 2026-09-05 (cron) — Phase 2 · A2: NORN'S ANNEX — the Phyrexian attack tax · **+1** · corpus 14,550 / 34,245
> Suite **1533 files / 16,282** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 5/5 killed.**
> · "Creatures can't attack you or planeswalkers you control unless their controller pays {W/P} for each of those
>   creatures." The tax module knew a generic digit and (since Sphere) a counted generic; a Phyrexian pip is a
>   per-attacker CHOICE — {W} or 2 life (CR 107.4f). The parser returns `{ phyrexian: "W" }`; a DETAIL reader
>   (attackTaxDetail — generic + the list of pips) sits beside the generic sum the existing pins read, and BOTH consumers
>   switched to it: legalChoices withholds the declaration unless the generic plus the pips can be paid in mana OR the
>   generic can be paid in mana and the attacker's controller has at least 2 life per pip (CR 119.4 — life can be paid
>   only from a total at least that large); the dispatcher pays the pips with mana when the payment plan can, and
>   otherwise pays the generic in mana and the pips in life through the one life-loss chokepoint (the same primitive the
>   pay-life mana lines use). All-mana or all-life per declaration — a documented house policy, never a mis-charge:
>   both are exactly what the printed card allows.
> · **Pins:** the parser's descriptor and the clause gate; Norn's Annex native; RUNTIME — a Plains funds the attack and
>   is tapped; no white source but 20 life: the attack is offered and costs 2 life; no source and 1 life: withheld;
>   Annex + Propaganda: {2} in mana and the pip in life when only two colourless sources are up; the life payment is
>   logged. Mutants: the pip arm gone, the life lane dropped (a mana-less attacker is refused), the life floor dropped
>   (an attack at 1 life offered), the pip paid as generic — mutants 5/5 killed.
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Atraxa 70 → **71** (14 to the bar)

> ## 🎯 2026-09-05 (cron) — Phase 2 · A3: DEPLOY THE GATEWATCH — the counted dig onto the battlefield · **+1** · corpus 14,549 / 34,245
> Suite **1532 files / 16,276** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 5/5 killed.**
> · "Look at the top seven cards of your library. Put up to two planeswalker cards from among them onto the battlefield.
>   Put the rest on the bottom of your library in a random order." The dig-to-battlefield frame (④-C — Kinnan's
>   "you may put a non-Human creature card … onto the battlefield") read ONE pick; the impulse-dig settler already
>   re-raises the choice until `keep` cards are picked and enters each one (a decline ends the picking — exactly
>   "up to"). The new arm is that frame with a keep count read from the up-to-N word table, the type through the
>   same tutor filter (an unlisted word parks), and the land printing yielding to the dig-land lane as before.
> · **Pins:** the atom (seven looked at, keep two, planeswalker filter, battlefield, random rest); "widget cards"
>   refused; Deploy native; RUNTIME — two walkers among the top seven both enter with their printed loyalty and the
>   other five go to the bottom; declining after one enters one; a top seven with no walker bottoms all seven.
> · **HOLLOW CLOSED on the way:** the runtime pin found the dug walkers entering with NO loyalty key — the non-cast entry
>   path (zones.enterCardFromZone, shared by reanimation and ramp) mirrored enterPermanent's setup but never stamped a
>   planeswalker's starting loyalty, so any dug or reanimated walker sat unattackable and unkillable. Both paths now read
>   ONE helper (gameState.planeswalkerEntryLoyalty: printed loyalty + Oath of Gideon's extra, doubled once); the private
>   Oath helper in resolvers moved there. Pinned: a walker dug under Oath enters with 5.
>   Mutants: the arm gone, the keep count dropped (one pick), the filter unchecked, the non-cast stamp dropped, the shared
>   reader forgetting Oath — mutants 5/5 killed.
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Atraxa 69 → **70** (15 to the bar); Arena Rector, Ashiok, Mutational Advantage sized in the A3 row

> ## 🎯 2026-09-05 (cron) — Phase 2 · A4: TEFERI, HERO OF DOMINARIA — the positional tuck · **+6** · corpus 14,548 / 34,245
> Suite **1531 files / 16,271** green; lint 0. Flip-diff **+6, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed (one survivor deleted as dead).**
> · "−3: Put target nonland permanent into its owner's library third from the top." The +1 (draw, then the delayed
>   two-land untap) and the −8 emblem already parsed HIGH; the −3 parked on the tuck parser's documented refusal of a
>   positional "Nth from the top". The zone mover knew only top (prepend) and bottom (append); it now takes a library
>   INDEX beside the top flag — index 0 is the top, so "third from the top" is index 2, clamped to the library's
>   length (a one-card library puts it on the bottom, as the rules do). The tuck atom carries the third placement and
>   the parser admits exactly the printed sentence on the same target words the top/bottom form reads.
>   The arm reads the ordinal — second / third / fourth — so Chronostutter, Isolation at Orthanc and Synchronized
>   Eviction ride the same placement; Lost to Legend's "historic" target word is not in the tuck vocabulary and parks.
> · **Pins:** the parser's atoms for second and third; the top/bottom forms unchanged; "historic" and a "fifth from the
>   top" refused; Teferi
>   native-planeswalker; RUNTIME — through the real loyalty lane on a five-card library the permanent sits at index 2
>   with the two cards above it untouched, and on a one-card library it sits on the bottom. Mutants: the arm gone, the
>   ordinal one too high, the mover ignoring the index (bottom), the registration dropping it — mutants 4/4 killed (one survivor deleted as dead). One survivor
>   resolved by deletion: an explicit clamp of the index to the library's length was unreachable because slice
>   already clamps past the end — the line is gone and the comment says why.
> · **Unplanned gains audited whole-card:** Bury in Books (its "costs {2} less if it targets an attacking creature" line is
>   the standing self-cost-reduction class — the cast site reads the raw oracle and an unmodelled metric pays full
>   price, a safe limitation) and Oust ("Its controller gains 3 life" is the player-referent projection playerReferent
>   .test.js pins at runtime after a Vapor Snag bounce — the recipient is stamped at the bind, so the tucked creature
>   having left the board changes nothing). One suite guard graduated — tuck.test.js had pinned the positional form as
>   arbiter by name; the three-way union, a fifth-from-the-top, and the "historic" target word stay pinned refused.
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Atraxa 68 → **69** (16 to the bar); six flips — Teferi plus Chronostutter, Isolation at Orthanc, Synchronized Eviction (the same ordinal) and Bury in Books, Oust (audited whole-card)

> ## 🎯 2026-09-05 (cron) — Phase 2 · A2: OATH OF GIDEON — the extra loyalty on entry · **+1** · corpus 14,542 / 34,245
> Suite **1530 files / 16,266** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · "When Oath of Gideon enters, create two 1/1 white Kor Ally creature tokens. / Each planeswalker you control enters
>   with an additional loyalty counter on it." The ETB was native; the static is the OTHERS-ENTER-WITH family (Renata /
>   Arwen / Bramblewood Paragon — "each other <Subtype> creature you control enters with an additional +1/+1 counter")
>   in its one planeswalker printing. The reader (othersEnterWithCounters — the single source the entry site honours
>   and coverage strips on) now returns a subject and a counter kind: the creature/+1/+1 shape is byte-identical
>   (defaults), and the planeswalker/loyalty shape is admitted exactly as printed. At the entry site the extra
>   loyalty is added to the printed starting loyalty BEFORE the counter doubler runs — with Doubling Season out the
>   controller orders the replacements to get 2 × (N + 1), the ruling — and the creature path is untouched.
> · **Pins:** the descriptor for both shapes, a nonsense counter word refused; Oath native; RUNTIME — a 4-loyalty walker
>   enters with 5 under Oath, 4 without, 10 under Oath + Doubling Season; two Oaths give 6; a creature entering under
>   Oath gets nothing; a walker entering under Renata gets nothing. Mutants: the planeswalker shape gone, the loyalty
>   added after the doubler (9 instead of 10), the subject gate dropped (a creature under Oath gets a loyalty counter),
>   the coverage strip not widened — mutants 4/4 killed.
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Atraxa 67 → **68** (17 to the bar)

> ## 🎯 2026-09-05 (cron) — Phase 2 · A2: SPHERE OF SAFETY — the counted attack tax · **+1** · corpus 14,541 / 34,245
> Suite **1529 files / 16,261** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · "Creatures can't attack you or planeswalkers you control unless their controller pays {X} for each of those
>   creatures, where X is the number of enchantments you control." The attack-tax module (Propaganda / Ghostly Prison /
>   Baird) read a FIXED digit only and refused every {X} on purpose — a mis-read amount is a mis-charge, the forbidden
>   direction. This one carrier's X is a count the shared count-source parser already reads ("enchantments you
>   control" → the controller-scoped enchantment count), so the parser returns a `countSource` descriptor instead of a
>   `generic`, and attackTaxToDeclare — the ONE gatherer legalChoices withholds on and the dispatcher pays through —
>   resolves it with countForSpec against the DEFENDER's live battlefield (the Sphere counts itself, as printed) at
>   every declaration. The coverage gate admits exactly that sentence; the domain {X} (Collective Restraint) stays
>   refused, pinned as before.
> · **Pins:** the parser's descriptor and the fixed forms unchanged; the clause gate admits the Sphere sentence and
>   still refuses the domain form; Sphere native; RUNTIME — Sphere + two other enchantments taxes {3} per attacker,
>   the Sphere alone {1}; the ATTACKER's own enchantments never count; the attack is withheld on two lands and
>   offered on three, and dispatching it taps all three. Mutants: the counted arm gone, the Sphere excluded from its
>   own count, the count keyed on the attacker's seat, the clause gate not widened — mutants 4/4 killed.
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Atraxa 66 → **67** (18 to the bar); one suite guard graduated — attackTaxPlaneswalkers had pinned Sphere of Safety as refused by name (the life-payment and domain refusals stay pinned)

> ## 🎯 2026-09-05 (cron) — Phase 2 · A4: GARRUK, UNLEASHED — the self-named loyalty counter · **+1** · corpus 14,540 / 34,245
> Suite **1528 files / 16,255** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · Atraxa opens (65, needs 20). The deck's sixteen non-walker leftovers cannot reach the bar alone, so the walkers
>   one ability from native are the entry: Garruk (the −2), Kiora (the +1 shield), Teferi Hero (the −3 tuck). Garruk's
>   −2 — "Create a 3/3 green Beast creature token. Then if an opponent controls more creatures than you, put a loyalty
>   counter on Garruk." — parsed LOW on one thing: the walker naming ITSELF. The effect parser has no card in hand,
>   so "Garruk" was never a self reference; with "this permanent" the whole line already parsed HIGH (the "then if"
>   peel, the readable board condition, the named-counter-self atom). parseLoyaltyAbilities — the single source the
>   runtime lane and the metric both read — now rewrites the fixed-count "put a loyalty counter on <own name>" tail
>   (full or short name, word-bounded, END-anchored) to the self noun. The atom's resolver lands on the SAME
>   `counters.loyalty` key the cost and the 0-loyalty SBA use, through addCounter — so Doubling Season doubles the
>   effect's counter and never the cost (the ruling). Eight walkers name themselves this way; the counted tails
>   ("for each …", "equal to …") are not rewritten and stay parked.
> · **Pins:** the −2's clause and atoms (create-token, then add-named-counter-self loyalty ×1 under the condition);
>   Huatli's counted tail untouched and unmodelled; Garruk native-planeswalker, Huatli not; RUNTIME through the real
>   loyalty lane — opponent ahead on creatures: a Beast and 4−2+1 = 3; no opponent creatures: a Beast and 2; under
>   Doubling Season: two Beasts and 4−2+2 = 4. Mutants: the rewrite gone, the short name dropped, the end anchor
>   dropped, the wrong self noun — mutants 4/4 killed.
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Atraxa 65 → **66** (19 to the bar); Kiora and Teferi Hero sized M in the A4 row; Interplanar Beacon sized L in A2

> ## 🎯 2026-09-05 (cron) — Phase 2 · F6: FEASTING HOBBIT — the typed devour · **+2** · corpus 14,539 / 34,245
> Suite **1527 files / 16,249** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 3/3 killed.**
> · "Devour Food 3 (As this creature enters, you may sacrifice any number of Foods. It enters with three times that
>   many +1/+1 counters on it.)" + the self-power block gate (slice 43, already modelled). Plain "Devour N" has been
>   credited since census slice 53 on the optional-mode family's purest reasoning — sacrificing ZERO is a legal
>   choice, "that many" is then zero, the creature enters exactly as printed. The typed form is the same ability
>   with a narrower sacrifice pool; the same zero choice exists. The gate admits exactly the three printed type words
>   (artifact — Caprichrome; Food — Feasting Hobbit; land — Famished Worldsire) and keeps the digit anchor: "Devour
>   Food X" would be an amount nobody computes and stays refused, as does an unlisted word.
> · Sized while looking for Bumble's last slot: Killer Service is LARGER than marked (the ETB count "equal to the
>   number of opponents you have" is an unmodelled source AND the end-step line is an optional pay+sacrifice
>   reflexive); Campsite Cuisine likewise (the union head now parks by design, and the attack line is an optional
>   X-sacrifice reflexive); Samwise the Stouthearted's ETB is native but "Then the Ring tempts you" is an unmodelled
>   mechanic. All three noted in §5 and skipped per §2.4.
> · **Pins:** Feasting Hobbit native; Devour artifact 1 / Devour land 3 credited as lines; plain Devour 2 unchanged;
>   "Devour Food X" refused; "devour widget 3" refused. Mutants: the typed alternative dropped, the type word
>   widened to any word, the digit anchor dropped — mutants 3/3 killed.
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run
> · Bumble Flower 84 → **85, AT THE BAR**; Caprichrome the unplanned gain, audited whole-card (flash + vigilance + Devour artifact 1); Famished Worldsire stays parked on its own look-at-top-X ETB

> ## 🎯 2026-09-05 (cron) — HARDENING: the self-ETB fallback's disjoint subject · **2 LOST on purpose** (hollows removed) · corpus 14,537 / 34,245
> Suite **1526 files / 16,246** green; lint 0. Flip-diff **0 gained / 2 LOST** — every loss audited as a dropped-half credit: Tomebound Lich ('enters or deals combat damage to a player') and Shield Mare ('enters or becomes the target of a spell or ability an opponent controls') — each had its second, PRODUCIBLE event silently dropped; the six vacuous-event compounds (turned face up / specializes) keep their ETB by the exemption. **mutants 4/4 killed.**
> · Surfaced while sizing Campsite Cuisine: "Whenever this enchantment or a legendary creature you control enters, create
>   a Food token." detected as a plain SELF-ETB — the "or a legendary creature you control" half silently dropped — and
>   that line alone classified native-trigger. A card credited native that fires on its own entry and never on the
>   legendary creature's: a confident partial, the forbidden direction. 66 printed heads carry the "this <noun> or
>   a/another <filter> … enters" shape; the modelled ones return from their own arms (Kor Celebrant's "or another
>   creature you control" → the creature scope, which includes the source's own entry; Satoru's "and/or one or more
>   other … enter" batch) and never reach the fallback.
> · The gate: the bare self-ETB fallback refuses a self reference whose condition still carries " or " — a disjunction
>   no arm modelled → UNDETECTED → Arbiter (a safe false-negative). The plain self-ETB is byte-identical.
> · **The first snapshot lost eight, and six of them were EVENT disjunctions with a VACUOUS second event** — "enters
>   or is turned face up" (five disguise/morph cards) and "enters or specializes": the engine has no face-up or
>   specialize action, so the ETB half IS the whole working ability (turnedFaceUpVacuous.test.js already pinned the
>   compound keeps its ETB). The gate exempts exactly those two phrases. The other two — Tomebound Lich ("or deals
>   combat damage to a player") and Shield Mare ("or becomes the target of …") — were credited with a trigger the
>   engine DOES fire silently dropped: hollows, and they stay parked.
> · **Pins:** Campsite's head detects nothing and the card parks; Kor Celebrant and Satoru keep their scopes and stay
>   native-trigger; a plain "When this creature enters" stays a self-ETB and native; Gadget Technician and Lae'zel
>   keep their ETB and stay native; Tomebound Lich and Shield Mare park. Mutants: the guard gone, the guard refusing
>   every self reference, the vacuous exemption dropped, the exemption widened to any event — mutants 4/4 killed.
> · **CI:** held — repo private, billing-blocked (zero-step failures); committed locally on the full local gates, pushes wait for the first green run

> ## 🎯 2026-09-05 (cron) — Phase 2 · F6: SAM, LOYAL ATTENDANT — Foods cost {1} less to activate · **+2** · corpus 14539 / 34,245
> Suite **1525 files / 16,245** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 5/5 killed.**
> · "Activated abilities of Foods you control cost {1} less to activate." The partner line and the combat-begin Food
>   were native. The Training Grounds family's marker knew two subjects (creatures, artifacts); it now knows three
>   more, each its OWN descriptor with its own runtime gate — the family's standing lesson is that a reducer credited
>   under the wrong gate discounts the wrong ability, a wrong PRICE the coverage tier can't see: "lands" (the card type
>   — Blossoming Tortoise), "artifact tokens" (an artifact that is a token — Mutagen Man), and a SUBTYPE plural
>   depluralized through the same helper the anthem parser uses and validated against the closed creature vocabulary
>   or the curated non-creature set ("Foods" → Food; "widgets" stays body-only). The gate matches the subtype
>   word-bounded on the permanent's front face.
> · **Pins:** the three subjects parse to their own descriptors and a non-subtype word stays unmodelled; Sam
>   native-mixed; with Sam out a Food's own ability costs {1} while a non-Food artifact's still costs {2}, and
>   without Sam the Food costs {2}. Mutants: the arm, any word admitted, the descriptor collapsed to the creature
>   default, the gate matching every artifact, the gate gone — mutants 5/5 killed.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Bumble Flower 83 → **84** (1 to the bar); Blossoming Tortoise the unplanned gain (the 'lands' subject; its other lines were already required modelled by the whole-card check); one suite guard graduated — artifactActivatedCostReduction had pinned 'lands you control' as refused by name

> ## 🎯 2026-09-05 (cron) — Phase 2 · F5: KWAIN — each player may draw · **+1** · corpus 14537 / 34,245
> Suite **1524 files / 16,242** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 6/6 killed.**
> · "{T}: Each player may draw a card, then each player who drew a card this way gains 1 life." The per-seat "may" pause
>   already existed for the Step Between Worlds wheel (APNAP — the controller first, each seat answers for itself, only
>   the yes-seats fold). A DRAW effect kind joins it: one template atom (the ", then" would shatter under the splitter),
>   the resolver raises the same pause with effect "draw" and a per-drawer life, the pause carries the field (a
>   whitelist — unlisted = dropped), the re-suspend passes it seat to seat, and the settler has each yes-seat draw
>   through the trigger-threading draw path and then gain through the lifegain-trigger path (CR 119.3) — the printed
>   order. No seat's choice is made for it.
> · **Pins:** the body parses to ONE each-player-may-draw atom with lifePerDrawer 1, native-activated; activating pauses
>   for the controller then the opponent, both yes → both draw one and gain one; the controller declining and the
>   opponent accepting → only the opponent draws and gains. Mutants: the template, the dropped life, the pause
>   forgetting the field, the re-suspend dropping it, folding every seat, the settler blind to the effect — mutants 6/6 killed.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Bumble Flower 82 → **83** (2 to the bar)

> ## 🎯 2026-09-05 (cron) — Phase 2 · F6: LEMBAS — its owner shuffles it into their library · **+1** · corpus 14536 / 34,245
> Suite **1523 files / 16,239** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 3/3 killed.**
> · "When this artifact is put into a graveyard from the battlefield, its owner shuffles it into their library." The ETB
>   scry-then-draw and the Food line were native; the third parked on its WORDING alone — the self-PiG leave event and
>   the shuffle-self-into-library op already routed for "shuffle it into its owner's library" (Fblthp), and the resolver
>   already finds a source that has left for the graveyard and moves it graveyard → library before shuffling. The
>   owner-voiced printing joins the arm. Inferno Hellion prints the wording on a different (end-step) head and stays.
> · **Pins:** the third line detects as the self leave event with the shuffle-self effect and ROUTES; Lembas
>   native-mixed; cracking it for life fires the leave trigger, the life resolves to 23, the graveyard is empty and
>   Lembas is in the library. Mutants: the wording gone, a different op, the resolver blind to the graveyard — mutants 3/3 killed.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Bumble Flower 81 → **82** (3 to the bar)

> ## 🎯 2026-09-05 (cron) — Phase 2 · F6: CONTINUE? — put there from the battlefield this turn · **+4** · corpus 14535 / 34,245
> Suite **1522 files / 16,237** green; lint 0. Flip-diff **+4, zero LOST** (any unplanned gains audited whole-card). **mutants 7/7 killed.**
> · "Choose up to four target creature cards in your graveyard that were put there from the battlefield this turn.
>   Return them to the battlefield." Three seams. (1) A per-card FROM-BATTLEFIELD-THIS-TURN stamp written by the zone
>   mover on every battlefield → graveyard move — the milledThisTurn twin, compared to the live turn so it never needs a
>   reset (23 printings of the qualifier). (2) An enumerator gate on it, threaded through targeting's graveyard-target
>   projection — a WHITELIST: unlisted = dropped = the gate never reaches the enumerator. (3) The splitter folds the
>   "choose … / return it|them …" pair into one clause and a zones arm parses it: the filter through the graveyard
>   filter parser, "up to N" → the subset machinery, to the battlefield = reanimate (the resolver already loops every
>   pick), to your hand = the return atom (Othelm, Niambi, Grim Return, Salvager of Ruin, Brought Back print the pair).
> · **Two things caught by the first witness run:** the stamp keyed by the PERMANENT id while the graveyard entry carries
>   the CARD id (the gate never matched), and the projection whitelist dropping the new flag (the old creature was
>   offered). Both fixed; both have mutants.
> · **Pins:** the folded pair parses to ONE reanimate with the gate and up-to-four targets, native-spell; the Othelm
>   and Salvager sibling shapes parse; the zone mover stamps two creatures that died this turn and not the old one;
>   the cast offers every subset of exactly those two — never the old creature or the instant — and the largest
>   returns both; a new turn offers only the empty set. Mutants: the stamp gone, the wrong key, the gate gone, the
>   projection dropping the flag, the fold gone, the arm without the gate, the arm without the count — mutants 7/7 killed.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Bumble Flower 80 → **81** (4 to the bar); Othelm, Salvager of Ruin, Brought Back the unplanned gains — the same choose-then-return pair with filters the arm reads, audited from their printed text

> ## 🎯 2026-09-05 (cron) — HARDENING: the Flashback line strip's rider swallow · **+0** (a hollow closed) · corpus 14531 / 34,245
> Suite **1521 files / 16,233** green; lint 0. Flip-diff **0 / 0** — the guard changes NO printed card. **mutants 3/3 killed.**
> · Surfaced by the Study the Classics flip-diff: Visions of Dominance flipped native, and its Flashback line carries
>   "This spell costs {X} less to cast this way, where X is …" — a rider no arm models. The card was honest anyway (the
>   engine never offers a flashback cast, so a rider on the flashback cost is a safe FN) — but the reason it classified
>   was worse than that: the cast-keyword line strip removes a Flashback line WHOLE (`[^\n]*$`), so ANY trailing sentence
>   vanished. Probed: a made-up "Flashback {3}{G}. When you cast this spell, you win the game." classified
>   native-spell. A modelled-looking card with an unmodelled ability — the forbidden direction, for text the corpus
>   has not printed yet.
> · The guard: a Flashback line whose trailing text (reminder-stripped) is neither empty nor "this way"-scoped is
>   fenced behind a prefix the keyword regex cannot match, stays as residue, and the card parks. Every printed
>   trailing sentence today IS "this way"-scoped (the Visions cycle ×5, Light Up the Night) — zero corpus impact.
> · Caught on the first run: my first fence began "flashback-rider…", and the keyword regex accepts "flashback" + a
>   dash — the fence was eaten by the very strip it was dodging. Renamed; the mutant that reintroduces it dies.
> · **Pins:** a bare line, a reminder line, the Visions rider and the Light Up the Night rider all still classify
>   native-spell; a "you win the game" rider and a "whenever you cast a spell, draw" rider park. Mutants: the guard
>   gone, the guard fencing every rider, the colliding fence name — mutants 3/3 killed.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])

> ## 🎯 2026-09-05 (cron) — Phase 2 · F5: STUDY THE CLASSICS — the bound double and the bound count · **+5** · corpus 14531 / 34,245
> Suite **1520 files / 16,232** green; lint 0. Flip-diff **+5, zero LOST** (any unplanned gains audited whole-card). **mutants 6/6 killed.**
> · "Put a +1/+1 counter on target creature, then double the number of +1/+1 counters on it. You gain life equal to the
>   number of +1/+1 counters on that creature." Three atoms, the last two BOUND to the first's target (CR 608.2 — the
>   pronoun is the object already acted on; referentBindingOk forces the program LOW without a targeting predecessor,
>   and the referent chain walks back past consecutive bound atoms). (1) The bound double: the per-target double the
>   conditional sentinel already used (Scythecat Cub), now on the previous atom's target — 10 printings of the "it"
>   form, 5 of "that creature". (2) The life half: the count-source parser read "+1/+1 counters on it / this creature"
>   as the SOURCE's count; "on that creature" is a spell anaphor for the bound target, never the source — a new
>   bound-target count kind, read off the bound slice at resolution, and the gain-life arm binds when it carries it.
> · **Pins:** the program parses HIGH as the three atoms with the two bound flags and the bound-target count kind,
>   native-spell; a bare bear beside an untouched Giant goes 0 → 1 → 2 for 2 life with the Giant at 0; a bear
>   carrying 2 goes 2 → 3 → 6 for 6 life. Mutants: the bound arm gone, its binding dropped, one counter instead of the
>   double, the count read as the source, the count kind unknown, the life arm unbound — mutants 6/6 killed.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Bumble Flower 79 → **80** (5 to the bar); four unplanned gains audited — Growth Curve, Invigorating Surge, Sage of the Fang (the same shape), Visions of Dominance (its flashback line's 'costs {X} less this way' rider modifies only a flashback cast the engine never offers — FN-safe, the same basis as the flashback strip; the line strip's swallow of ANY trailing sentence is a hollow closed in the next commit)

> ## 🎯 2026-09-05 (cron) — Phase 2 · F6: SAMWISE GAMGEE — "historic" · **+2** · corpus 14526 / 34,245
> Suite **1519 files / 16,229** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · "Whenever another nontoken creature you control enters, create a Food token. / Sacrifice three Foods: Return target
>   historic card from your graveyard to your hand." The Food trigger and the sacrifice-three-Foods cost were already
>   modelled (the same line with "creature card" classified native-activated); the return parked on ONE word.
>   "historic" (CR 205.4h — an artifact, a legendary, or a Saga) joins the graveyard filter vocabulary as a WHOLE
>   token, matched off the front-face type line by any of its three words. Five printings of the phrase.
> · Sized UP on the way (noted in the F5 row): Treebeard's "put that many +1/+1 counters on target Halfling or
>   Treefolk" needs a subtype-union target pool, "halfling" in the curated allowlist, and a lifegain that-many-on-TARGET
>   sentinel — three seams for about one card (the bare "target <CreatureSubtype>" vein is 24 uses corpus-wide, all
>   verbs). Left ⬜ for Phase 3.
> · **Pins:** the token parses whole and matches the artifact, the legendary and the Saga but not the bear or the
>   bolt; Samwise native-mixed; with three Foods the ability is offered ONLY at the historic cards, and activating at
>   the Saga sacrifices the Foods and returns it to hand. Mutants: the word gone, the branch gone, artifact-only,
>   any-card — mutants 4/4 killed.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Bumble Flower 78 → **79** (6 to the bar); Layla Hassan the unplanned gain, audited whole-card (first strike + a compound ETB/combat-damage head returning a historic card); one suite guard graduated — gyRecursion had listed 'historic' as unmodelled by name

> ## 🎯 2026-09-05 (cron) — Phase 2 · F6: HOT SOUP — the equipped creature is dealt damage · **+1** · corpus 14524 / 34,245
> Suite **1518 files / 16,227** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed (one survivor got its missing test).**
> · "Equipped creature can't be blocked. / Whenever equipped creature is dealt damage, destroy it. / Equip {3}". The
>   unblockable grant and the Equip were already modelled. Two gaps on the trigger: the dealt-damage event had self and
>   creature-you-control scopes but not the EQUIPPED one (a new condition arm — the checker already offers the attached
>   Equipment as a watcher with the damaged creature as the triggering permanent, and scopeMatches' equippedCreature
>   rule reads the attachment, CR 301.5); and "destroy it" had no road to the triggering-creature destroy sentinel on
>   that scope (an exact-clause rewrite beside Toxin Sliver's "destroy that creature" — a rider stays unrewritten →
>   LOW). Three printings of the head (Fiendlash, Blazing Sunsteel carry other payoffs).
> · **Pins:** the descriptor detects on the equipped scope with the sentinel effect, native-equipment; damage to the
>   equipped bear fires Hot Soup and the bear is destroyed with the Equipment staying; damage to the other bear fires
>   nothing. A survivor got its missing test: the exact-clause anchor on the rewrite was unwitnessed, so a synthetic
>   "destroy it. You gain 2 life." now pins that the rider survives the rewrite stage and the card parks (no partial).
>   Mutants: the arm, the wrong scope, the rewrite gone, the rewrite widened past the exact clause — mutants 4/4 killed (one survivor got its missing test).
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Bumble Flower 77 → **78** (7 to the bar)

> ## 🎯 2026-09-05 (cron) — Phase 2 · F6: ELANOR GARDNER — "if you sacrificed a Food this turn" · **+2** · corpus 14523 / 34,245
> Suite **1517 files / 16,224** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 5/5 killed.**
> · "At the beginning of your end step, if you sacrificed a Food this turn, you may search your library for a basic land
>   card, put that card onto the battlefield tapped, then shuffle." Swapping the condition for a known one classified
>   the card native-trigger, so the memo was the only gap. A per-player SACRIFICED-THIS-TURN memo ({ name, type } per
>   sacrifice) is stamped at the ONE sacrifice chokepoint every path calls (checkSacrificeTriggers — the effect/edict
>   sac, the cost sac, the Treasure crack), reset for all seats with the other per-turn ledgers, and read word-bounded
>   against each sacrificed card's type line ("Food" on "Token Artifact — Food"; "permanent" = any sacrifice; the
>   contraction "you've" admitted). An empty memo reads FALSE, not null — the parseable probe admits the shape and an
>   untouched turn is simply "no". Three printings of the phrase (Food / permanent / permanents).
> · Read on the way, and pinned as the engine's convention: an intervening-if end-step trigger ENQUEUES either way and
>   the condition is checked at RESOLUTION — the untouched turn resolves to nothing, the cracked-Food turn resolves into
>   the printed "you may" pause.
> · **Pins:** the descriptor carries the intervening-if, the condition is parseable, native-trigger; the reader is false
>   before, true after the Food's own cost-sacrifice, true for "you've", false for "creature", true for "permanent", the
>   memo holds the Food, the next turn's reset clears it; at the end step untouched → nothing, cracked → the pause.
>   Mutants: the arm, the type word ignored, the chokepoint not stamping, the reset forgetting, the recorder dropping
>   the type — mutants 5/5 killed.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Bumble Flower 76 → **77** (8 to the bar); Detective's Satchel the unplanned gain, audited whole-card (its activation condition 'you've sacrificed an artifact this turn' reads the new memo; investigate twice + the Thopter were already modelled)

> ## 🎯 2026-09-05 (cron) — Phase 2 · F6: SHORELINE LOOTER + NIGHT OF THE SWEETS' REVENGE — "unless" and the bare Overrun-X · **+8** · corpus 14521 / 34,245
> Suite **1516 files / 16,221** green; lint 0. Flip-diff **+8, zero LOST** (any unplanned gains audited whole-card). **mutants 6/6 killed (one survivor got its missing test).**
> · **Shoreline Looter** — "Threshold — Whenever this creature deals combat damage to a player, draw a card. Then discard a
>   card unless there are seven or more cards in your graveyard." The trailing conditional rider (CD-2, "<effect> if
>   <board-condition>") grew its NEGATED connective: "<effect> unless <cond>" rides as `condition` + `conditionNegate`,
>   and the program runner runs the atom only when the condition reads DEFINITELY false — a null read still skips, so
>   the rider is dropped, never fabricated, in both polarities (CREED). The threshold reader ("there are seven or more
>   cards in your graveyard") was already board-readable. Everything else is the CD-2 gate verbatim.
> · **Night of the Sweets' Revenge** — "{5}{G}{G}, Sacrifice this enchantment: Creatures you control get +X/+X until end of
>   turn, where X is the number of Foods you control. Activate only as a sorcery." The Overrun-X team pump existed only
>   with a keyword grant ("gain trample and get +X/+X"); the keyword-less twin joins, its count source read at
>   resolution through parseCountSource with the scope option ("Foods you control" is a subtype count). Ten printings,
>   each with its own count source — the others flip only if theirs parses (audited at the flip-diff).
> · **Pins:** the unless-tail parses to a discard with the negated condition and the bare Overrun-X to a Food-count team
>   pump; Looter native-trigger, Sweets native-mixed; at resolution Looter below threshold draws then PAUSES on the
>   discard pick, at threshold draws and skips the discard; Sweets with two Foods pumps each creature +2/+2 and is gone.
>   A survivor got its missing test: the runner's null-read guard for the negated polarity was unwitnessed (the parser
>   never attaches an unreadable condition), so a hand-built atom with an unreadable negated condition now pins that
>   the rider does NOT run. Mutants: the connective, the dropped flag, the runner ignoring negation, a null read running
>   the negated rider, the bare arm, the dropped count — mutants 6/6 killed (one survivor got its missing test).
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Bumble Flower 74 → **76** (9 to the bar); six unplanned gains audited whole-card — Chart a Course, Chakra Meditation, The Spot's Portal, Mindwrack Demon, Bellowing Saddlebrute (all 'unless' riders on conditions the reader already accepted under 'if'), Become the Avalanche (the bare Overrun-X with cards in hand)

> ## 🎯 2026-09-05 (cron) — Phase 2 · F5: WAVE GOODBYE + RIOT CONTROL — four small arms on shared grammar · **+3** · corpus 14513 / 34,245
> Suite **1515 files / 16,217** green; lint 0. Flip-diff **+3, zero LOST** (any unplanned gains audited whole-card). **mutants 7/7 killed.**
> · **Wave Goodbye** — "Return each creature without a +1/+1 counter on it to its owner's hand." Two gaps: the mass bounce
>   knew "return ALL <filter> creatures" but not the singular "return EACH creature <filter>" (a new arm delegating to the
>   same shared restriction grammar through the same damage-sentence disguise — Restore the Peace's "each creature that
>   dealt damage this turn" rides the same road), and the grammar knew "with no counters" but not the negated NAMED
>   form "without a <type> counter on it". Tracked kinds only (+1/+1, -1/-1, stun — the ④-AC discipline): a printed
>   type the runtime never places (fate, egg, rope, blaze — Oblivion Stone's kin) would make the negation ALWAYS true
>   and credit a sweep that can never be narrowed, so it stays residue (pinned).
> · **Riot Control** — "You gain 1 life for each creature your opponents control. Prevent all damage that would be dealt
>   to you this turn." The gain-life-for-each arm called the count-source parser WITHOUT the scope option the token and
>   library count arms already pass, so "creature your opponents control" parked; passed now (a board count a resolving
>   spell can read). "Prevent all damage … to you" is the controller's this-turn shield with a FINITE amount no hit
>   exhausts — not Infinity, because the shield is plain JSON and a saved game would restore it as null.
> · **Pins:** Wave Goodbye parses to the negated +1/+1 hasCounter mass bounce and Riot Control to the scoped count +
>   the shield, both native-spell; an untracked counter type stays residue; at resolution Wave Goodbye bounces every
>   counter-less creature on BOTH sides and spares the countered ones; Riot Control gains 1 per OPPONENT creature (own
>   creatures don't count) and a later 9-damage hit through the real damage path is prevented. Mutants: the without-form,
>   its negate, its widening to any word, the each-arm, the scope option, the prevention arm, a small shield — mutants 7/7 killed.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Bumble Flower 72 → **74** (11 to the bar); Emissary of Hope the unplanned gain, audited by RUNTIME probe (its 'that player' count reads the damaged player through the resolver's designed fallback — three artifacts, three life)

> ## 🎯 2026-09-05 (cron) — Phase 2 · F6: HEAPED HARVEST — "when you sacrifice it" · **+2** · corpus 14510 / 34,245
> Suite **1514 files / 16,213** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed (after two survivors collapsed into one strip).**
> · "When this artifact enters and when you sacrifice it, you may search your library for a basic land card, put it onto
>   the battlefield tapped, then shuffle. / {2}, {T}, Sacrifice this artifact: You gain 3 life." Two gates, one behind
>   the other. (1) The compound head already split into two triggers, but "you sacrifice it" had no condition arm — the
>   self-sacrifice form was gated to auras (the Ordeal cycle). Widened to every self-noun and the bare "it" (in a trigger
>   CONDITION it can only be the source, CR 201.4); the sacrifice checker already fires youSacrificeThis from the
>   sacrificed card whatever its type. (2) Both heads then detected and ROUTED — and the card still parked, because the
>   activated parser refused the Food's own self-sacrifice cost: the γ1 fail-safe refuses a self-sac cost on any card
>   carrying a "when you sacrifice" trigger or an embedded "and when" head, on the premise that the sacrifice would drop a
>   trigger the leave paths never fire. For the SELF-sacrifice head that premise is false — the cost path's sacrifice
>   chokepoint fires exactly that trigger — so the sac-scoped guard now excises the self-sacrifice HEAD (not the effect)
>   wherever it sits, standalone or embedded, before the drop check (verified by RUNTIME probe, the discipline the
>   guard's other exemptions were earned with). Three printed pairings: Heaped Harvest, Carrot Cake, Esoteric Duplicator.
> · **Two survivors that collapsed into one strip:** I first wrote two strips (embedded head, standalone head); each
>   survived its mutant, because the case-insensitive standalone form also matched the embedded mid-sentence "when" —
>   either alone covered the witnessed compound. One honest strip replaced both, with a standalone-head pin (a synthetic
>   Food: "When you sacrifice this artifact, draw a card." beside its own sac cost) and a mutant proving an UNRELATED
>   embedded head ("…and when an opponent draws a card") still refuses.
> · Read on the way: legal choices offer activated abilities ONLY on a native-tier card (the lockstep gate), which is why
>   the Food line vanished the moment the trigger line sat beside it — the tier, not the line, was the switch.
> · **Pins:** both heads detect for Heaped Harvest and Carrot Cake, both native-mixed; the guard admits the standalone
>   self-sac head and still refuses an unrelated embedded head; paying the Food's own cost fires the trigger ABOVE the
>   ability (life still 20 at the pause — CR 603.3), the printed "you may" pauses, a yes suspends the search on the
>   Forest, the pick lands it tapped, then the life resolves to 23 with an empty stack. Mutants: the aura-only arm, the
>   strip gone, the strip widened to any head, the cost path no longer firing the checker — mutants 4/4 killed (after two survivors collapsed into one strip).
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Bumble Flower 71 → **72** (13 to the bar); two suite guards graduated — selfLtbCostSac and abilities.test had pinned the exact refusal this slice inverted, the Carrot Cake pin by name

> ## 🎯 2026-09-05 (cron) — Phase 2 · F4: ACADEMY MANUFACTOR — one of each · **+1** · corpus 14508 / 34,245
> Suite **1513 files / 16,209** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 7/7 killed.**
> · Bumble Flower's first slice (70 → the §5 order after Otharri). "If you would create a Clue, Food, or Treasure token,
>   instead create one of each." A token-creation REPLACEMENT (CR 614.1) on the doubler profile — the seam the Peregrin
>   Took "extra Food" already uses. At the single mint chokepoint each Clue / Food / Treasure in the batch spawns the
>   two MISSING kinds, raw, as part of the same creation event (CR 614.5); one pass per Manufactor the creator controls,
>   passes applied in turn (two Manufactors: one Food → three of each — the printed ruling); the strip predicate (the
>   single source of truth for the whole-card residue check) learned the sentence.
> · **Caught by the first witness run:** I had multiplied the spawn by the creator's token doubler, the Took
>   convention — WRONG here. Manufactor REPLACES each token with one of each, so beside Anointed Procession one Food is
>   two of each in EITHER replacement order (double first → two Foods → each one of each; Manufactor first → one of
>   each → doubled); doubling the spawn again gave 2/4/4. The Took extra is ADDITIVE, which is why it is doubled.
>   The other two first-run failures were my fixture (every permanent on the user's battlefield — fixed per seat).
> · **Pins:** the profile, the strip, one pass per YOUR Manufactor (the opponent's inert), native-static; one
>   Manufactor 1/1/1, a Soldier untouched, the opponent's Manufactor does nothing to your Treasure; two Manufactors
>   3/3/3; a doubler beside one 2/2/2. Mutants: the arm, the dropped field, the strip, the owner-blind pass count,
>   a single pass, the own-kind guard, the unread passes — mutants 7/7 killed.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Bumble Flower 70 → **71** (14 to the bar)

> ## 🎯 2026-09-05 (cron) — Phase 2 · O10: STAFF OF THE STORYTELLER — the batched creature-token event · **+1** · corpus 14507 / 34,245
> Suite **1512 files / 16,206** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 6/6 killed.**
> · "Whenever you create one or more creature tokens, put a story counter on this artifact." The ETB Spirit and the
>   "{W}, {T}, Remove a story counter: Draw a card" line were already native; the row had been sized "no tokens-created
>   event exists" — wrong: a tokenChange/onCreate event (Mirkwood Bats) fires per minted token from the mint tail. The
>   new arm is the BATCHED CREATURE form: a once-per-batch descriptor (one firing per create event however many
>   tokens, CR 603.2d — deduped across the mint tail's per-token calls by the Satoru mechanism) gated to a CREATURE
>   token, which the checker can now see because the mint tail hands it the minted token's card (a Treasure fires
>   nothing; a legacy caller passing no card never fires the creature form — FN-safe).
> · A pin I wrote wrong: the activation's text is its EFFECT ("Draw a card."), not its cost; the honest pin is that the
>   line is offered with a story counter on the Staff and not offered without one.
> · **Pins:** the arm carries oncePerBatch + creatureTokensOnly, native-mixed; two Soldier tokens in one batch → ONE
>   trigger → one story counter; a Treasure → nothing; the draw line offered with the counter, not without. Mutants:
>   the arm, the missing batch flag, the unlisted gate, the checker ignoring the gate, the cross-call dedupe, the mint
>   tail's dropped card — mutants 6/6 killed.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Otharri 84 → **85 — AT THE BAR** (the deck is done for Phase 2; the remaining rows stay ⬜ for Phase 3)

> ## 🎯 2026-09-05 (cron) — Phase 2 · O10: INTI — the batched discard + the next-end-step window · **+3** · corpus 14506 / 34,245
> Suite **1511 files / 16,203** green; lint 0. Flip-diff **+3, zero LOST** (any unplanned gains audited whole-card). **mutants 9/9 killed (the splitter-fold survivor became the Haste Magic pin).**
> · "Whenever you discard one or more cards, exile the top card of your library. You may play that card until your next
>   end step." Inti's first line (the reflexive discard → counter + trample) was already native; the second parked on
>   two phrases. (1) THE BATCHED DISCARD EVENT — 12 printings (Toluz, Dying to Serve, Cryptcaller Chariot, Rielle …):
>   one firing per discard event however many cards (CR 603.2d). A once-per-batch descriptor; checkDiscardTriggers
>   fires the per-card form `count` times and keeps the batch form on the first pass only, then dedupes against an
>   unflushed pending firing from the same source (the Satoru mechanism), so a discard cost paid card by card still
>   fires once. (2) THE NEXT-END-STEP WINDOW — 5 printings (Opera Love Song, Haste Magic, Dragonhawk …): CR 500.2 /
>   118.10 — on the controller's own turn before the end step it is THIS turn's end step (the plain this-turn stamp);
>   on any other turn, or during their own end step, it is their NEXT turn's (the extended owner-turn stamp). The
>   matcher marks the flag "nextEndStep" and the resolver decides from the live turn — never from the parse.
> · **A survivor that named its own pin:** the splitter's two-sentence fold was widened to the new window and its
>   mutant SURVIVED on Inti — a trigger's effect text reaches the template whole, so the fold never ran for her. It
>   runs for a SPELL: Haste Magic ("Target creature gets +3/+1 and gains haste … Exile the top card … You may play it
>   until your next end step.") flipped native-spell on exactly that fold, and is now the pin that kills the mutant
>   (audited whole-card: the pump, the haste, the impulse — all modelled). Opera Love Song / Aether Racing still park
>   on their OTHER modes (a one-or-two target count; tiered team modes).
> · **Pins:** the arm carries oncePerBatch, the matcher reads the window, Inti native-trigger; Haste Magic native-spell; a two-card discard fires
>   once and a card-by-card pair fires once; own-turn main → the plain stamp; an opponent's turn → the extended
>   owner stamp; own end step → the extended stamp. Mutants: the arm, the missing flag, the in-call dedupe, the
>   cross-call dedupe, the matcher, the plain-extended emit, the this-turn-everywhere resolver, the end-step edge,
>   the splitter fold — mutants 9/9 killed (the splitter-fold survivor became the Haste Magic pin).
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Otharri 83 → **84** (1 to the bar); Dying to Serve the second unplanned gain, audited whole-card (batched discard → tapped Zombie, once each turn — all modelled)

> ## 🎯 2026-09-05 (cron) — Phase 2 · O10: OTHARRI'S SELF-RETURN — the tap-an-untapped cost · **+2** · corpus 14503 / 34,245
> Suite **1510 files / 16,197** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 5/5 killed.**
> · "{2}{R}{W}, Tap an untapped Rebel you control: Return this card from your graveyard to the battlefield tapped." The
>   deck's COMMANDER: its attack trigger (experience counter + tapped-and-attacking Rebels) was already native; only
>   this line parked. The graveyard self-recursion arm (GY-1) knew mana, discard and exile-from-graveyard costs — it
>   now carries a TAP-AN-UNTAPPED-<X>-YOU-CONTROL component (CR 602.1b: tapping ANOTHER permanent, so the tapped
>   creature's summoning sickness is irrelevant — CR 302.6 restricts only its own {T}). Legal choices offer ONE action
>   per eligible untapped permanent ("creature" reads layer-aware; a subtype word is a word-bounded type-line match);
>   the dispatcher re-verifies the victim against the live board and taps it before the ability stacks. Purple Pentapus
>   ("… an untapped creature you control …") is the second printed carrier.
> · Coverage keys on the same parse (parseGraveyardSelfRecursion), so the classifier followed for free — Otharri
>   reads native-mixed (a native trigger AND a native activated line), Pentapus native-activated.
> · **Pins:** the parse carries the component for both cards; offered once per UNTAPPED Rebel (a tapped Rebel and a
>   non-Rebel are not candidates); activating taps the chosen Rebel and Otharri returns tapped with the graveyard
>   empty; no untapped Rebel → not offered; Pentapus accepts a summoning-sick creature. Mutants: the arm, the dropped
>   component, the subtype ignored, a tapped candidate admitted, the tap never paid — mutants 5/5 killed.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Otharri 82 → **83** (2 to the bar); Purple Pentapus the second carrier, audited whole-card (surveil ETB + the return, both modelled); one suite guard graduated — the O1 tapped-attacking witness had pinned Otharri body-only ON this very line

> ## 🎯 2026-09-05 (cron) — Phase 2 · O8: TITHE — the targeted-opponent compare on a tutor's count · **+1** · corpus 14501 / 34,245
> Suite **1509 files / 16,193** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 6/6 killed (a 7th, the intent arm, survived and was deleted as dead).**
> · "Search your library for a Plains card. If target opponent controls more lands than you, you may search your
>   library for an additional Plains card. Reveal those cards, put them into your hand, then shuffle." Split, the
>   middle sentence is a leading-if the peel refuses (a TARGETED compare — no board reader) and the last is an
>   unbindable "reveal those cards", so the card parked whole. The splitter now folds the three sentences into ONE
>   clause (anchored to the exact shape) and a tutor arm emits ONE atom: the printed hand fetch, targetType
>   "opponent", `remaining` 1, and a compare rider. applyTutor reads the chosen opponent's tally against the
>   controller's at resolution (CR 608.2 — the shared `controllerMetric`, now exported from interveningIf) and adds the
>   extra pick when STRICTLY greater. The "you may" needs no new machinery: a filtered search may fail to find (CR
>   701.19b) and the chain carries that optionality to every pick, so the second Plains can be declined.
> · The target intent is "enemy" — and a survivor taught me it already was: I added an intent arm for the targeted
>   tutor, its mutant SURVIVED, and the reason is that the generic opponent-pool rule at the top of atomTargetIntent
>   answers "enemy" before any case runs. The duplicate arm was deleted (a comment marks the spot); the cast is
>   offered only at the opponent.
> · **Pins:** the program parses HIGH as one atom with the rider, enemy intent, native-spell; opponent ahead 2 vs 1 →
>   the search suspends with remaining 2 and both Plains reach the hand through the chain; ahead but the second pick
>   declined → one Plains and the chain ends; equal 2 vs 2 → a single pick (strictly greater is the printed test).
>   Mutants: the arm, the fold, the unlisted rider, >= for >, the extra dropped from remaining, the controller's own
>   tally on both sides, the ambiguous intent — mutants 6/6 killed (a 7th, the intent arm, survived and was deleted as dead).
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Otharri 81 → **82** (3 to the bar)

> ## 🎯 2026-09-05 (cron) — Phase 2 · O10: REROUTE SYSTEMS — the artifact-or-creature grant · **+2** · corpus 14500 / 34,245
> Suite **1508 files / 16,189** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 4/4 killed.**
> · "Choose one — • Target artifact or creature gains indestructible until end of turn. • Reroute Systems deals 2
>   damage to target tapped creature." The burn mode already parsed (a tapped restriction). The grant mode needed the
>   keyword grant on the ARTIFACT-OR-CREATURE union: the proven β-2 pool (enumerateTargets' creatureOrArtifact
>   predicate, every pick tagged type:"permanent") carries it, and the pump resolver's creature gate — opened for the
>   bare permanent scope one slice ago — now names the union beside it (a small PUMP_PERMANENT_SCOPES set; every
>   creature-scoped pump keeps the creature-only gate). Loran's Escape ("… gains hexproof and indestructible … Scry 1.")
>   is the second printed carrier and rides through a splitter keep-whole for the union subject (its keyword list
>   shattered on " and " exactly like the permanent subject did).
> · A pin I wrote wrong and the engine corrected: the grant mode is offered at the OPPONENT'S creature too — the
>   printed target has no controller clause — and the aura is out. Recorded as printed.
> · **Pins:** both modes parse HIGH (the union grant + the tapped burn), native-spell; Loran's Escape HIGH with the
>   two-keyword union grant and the scry, native-spell; at cast the grant mode is offered at the artifact and both
>   creatures but not the aura; cast at the artifact it gains indestructible (a non-creature pick kept by the gate),
>   cast at the creature the creature gains it and the artifact does not. Mutants: the arm, the creature-scope emit,
>   the closed gate, the missing keep-whole — mutants 4/4 killed.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Otharri 80 → **81** (4 to the bar); Loran's Escape the second printed carrier, audited whole-card (union grant + scry)

> ## 🎯 2026-09-05 (cron) — Phase 2 · O11: HOUR OF RECKONING — the nontoken wipe · **+1** · corpus 14498 / 34,245
> Suite **1507 files / 16,187** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **mutants 5/5 killed.**
> · "Convoke. Destroy all nontoken creatures." Convoke is a stripped cost-only keyword (the engine hard-casts at full
>   cost — the Ninjutsu precedent). The wipe is the each-creature destroy NARROWED by token-ness through the shared
>   restrictions grammar: a new satisfier kind `token` (negate:true keeps the nontoken creatures) reading the
>   `card.token` flag every token-creating path stamps — the same field the sacrifice pools read. The subtype arm
>   used to read the word as non-"token" and null (a safe park — "token" is no curated subtype); the new arm sits
>   before it so the subtype arm can never claim it. One printed carrier of the creature form.
> · The satisfier's fail-closed audit note (CD-1 hardening) named `token` as a kind that never reached it — amended:
>   a restriction kind:"token" now has a branch; interveningIf's own `token` condition shape is unrelated.
> · **Pins:** the stripped program parses HIGH as destroy/eachCreature with the token:negate restriction, native-spell;
>   at resolution every nontoken creature on BOTH sides dies while every token creature and a non-creature artifact
>   survive. Mutants: the arm, the dropped restriction, the un-negated kind, the missing satisfier branch, the
>   inverted flag — mutants 5/5 killed.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Otharri 79 → **80** (5 to the bar)

> ## 🎯 2026-09-05 (cron) — Phase 2 · O9: BLACKSMITH'S SKILL — the permanent grant + the type-conditional rider · **+2** · corpus 14497 / 34,245
> Suite **1506 files / 16,185** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **mutants 7/7 killed.**
> · "Target permanent gains hexproof and indestructible until end of turn. If it's an artifact creature, it gets +2/+2
>   until end of turn." Two seams. (1) The keyword grant on a target PERMANENT: the creature arm's twin with
>   targetType "permanent" (the cast path and the resolver's target gate already served that scope) — but the clause
>   never reached it because splitClauses' permanent-subject keep-whole was nailed to "target permanent YOU CONTROL",
>   so the bare form shattered on the " and " inside "hexproof and indestructible" (found by the DBG-at-the-arm probe:
>   the arm saw "target permanent gains hexproof"). (2) The rider: "it's an artifact creature" is a per-object
>   condition no board reader can evaluate, so the leading-if peel steps aside and a dedicated bound-referent arm
>   carries it as `ifBoundTypes`; applyPumpEffect reads the target's LAYER-4 types at resolution (CR 608.2) and pumps
>   only when every listed type is present — an artifact animated into a creature counts.
> · **Found on the first witness run:** the pump loop's creature gate dropped the golem before the type check ran —
>   the permanent pool tags every pick type:"permanent", and the rider atom has no targetType of its own. Opened for
>   an atom carrying ifBoundTypes only; every other pump is byte-identical.
> · **Pins:** the program parses HIGH with the two atoms and classifies native-spell; a plain creature keeps 2/2
>   with both keywords, an artifact creature goes 3/3 → 5/5, a non-creature artifact gets the keywords and no pump,
>   an animated artifact (layer-4 Creature grant, printed line still "Artifact") goes 1/1 → 3/3. Mutants: the two
>   arms, the unlisted condition, any-vs-every, the printed-line read, the closed gate, the "you control" keep-whole
>   — mutants 7/7 killed.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Otharri 78 → **79** (6 to the bar); Renegade's Getaway the unplanned gain, audited whole-card (permanent grant + Servo token, both modelled)

> ## 🎯 2026-09-05 (cron) — Phase 2 · O6: GLIMMER LENS — the company condition · **+5** · corpus 14495 / 34,245
> Suite **1505 files / 16,182** green; lint 0. Flip-diff **+5, zero LOST** (any unplanned gains audited whole-card). **mutants 8/8 killed.**
> · "Whenever equipped creature and at least one other creature attack, draw a card." The equipped-creature attack
>   trigger carries a `withCompany` flag; the attack checker drops the firing unless ANOTHER attacker beyond the
>   trigger's own creature was declared (one declaration, one batch — CR 508.1). The attack block's guard knew only the
>   singular "attacks", so the plural "…creature attack" never reached the classifier — it reads `attacks?` now.
>   For Mirrodin! was already modelled.
> · **The flip-diff caught an over-fire and the arm grew a SELF form:** Sokka ("~ and at least one other creature
>   attack") and Paired Tactician ("this creature and at least one other Warrior attack") first flipped as PLAIN
>   self-attack triggers — firing on a lone attacker. A self-and-company arm now sits first in the attack block, with an
>   optional `companySubtype`; the gate excludes the trigger's own creature and matches the company's printed subtype.
>   Temmet and Boosted Sloop ("Whenever you attack, draw…") flipped because the plural-blind block had mis-split them.
> · **A survivor that turned out load-bearing:** the splitter's event-verb list was widened to the base-form "attack"
>   and its mutant SURVIVED the Glimmer pins (that sentence has one comma). I deleted it — and the re-snapshot LOST
>   Temmet and Boosted Sloop: "Whenever you attack, draw a card, then discard a card." has the second comma, and
>   without the base form the draw was swallowed into the condition. Restored, pinned on Temmet (the mutant dies now).
>   Lesson written into the comment: the flip-diff, not the witness, is what proved it.
> · **Pins:** the equipped bear attacking with another creature fires once and draws; alone it does not; two others
>   attacking without the equipped bear does not; Sokka alone 0 / with a bear 1; Paired Tactician alone 0 / with a bear
>   0 / with a Warrior 1; Temmet splits into its two triggers (you-attack, card-drawn) and classifies native-trigger.
>   Mutants: the descriptor, the unlisted flag, the missing gate, the self arm, the own-creature counted as company,
>   the dropped subtype gate, the singular-only block, the base-form-blind splitter — 8/8 died.
> · **CI:** held (repo private, billing-blocked; push on first green — [Q-CI2])
> · Otharri 77 → **78** (7 to the bar)

> ## 🎯 2026-09-05 (cron) — Phase 2 · O7: MINAS TIRITH — the raid flag as a count · **+1** · corpus 14490 / 34,245
> Suite **1504/16178** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **3/3 killed.**
> · "{1}{W}, {T}: Draw a card. Activate only if you attacked with two or more creatures this turn." The activation gate
>   already reads the shared intervening-if evaluator; it knew "you attacked this turn" (the raid flag) but not a COUNT. A
>   count arm now reads the per-permanent attacked-this-turn memo (KT-1) over the controller's battlefield — a creature
>   that attacked and left is not counted, the false-negative-safe side. The tapped-unless static and the mana line were
>   already whole, so the land is whole.
> · **Pins:** the evaluator says true with two attackers, false with one attacker beside three bystanders, false with none;
>   the activation is offered after two attackers and draws, not after one. Mutants: the arm, strictly-more, and every-creature-
>   counts — all died.
> · **CI:** blocked — repo PRIVATE (billing), zero-step failures; committed locally on full gates, push on the first green run ([Q-CI2])
> · **Otharri 76 → 77 (needs 8)** · four decks at 85 (Killer Turts · Kinnan · Believe it! · Shalai). Next: O6 Glimmer Lens (the company condition), then O5 Anim Pakal, O9 Blacksmith's Skill, O8 Tithe.

> ## 🎯 2026-09-05 (cron) — Phase 2 · H13b: SOLITUDE — the other-target qualifier and EVOKE · **+3** · corpus 14489 / 34,245
> Suite **1503/16176** green; lint 0. Flip-diff **+3, zero LOST** — two unplanned twins audited whole-card: Grief (an
> already-native ETB behind the same pitch-evoke line — it gains a REAL evoke cast) and White Orchid Phantom (an up-to-one
> destroy with the known ramp-basic controller rider, admitted by the widened rider lead). **10/10 killed.**
> · ⚠️ **ALT COSTS ON PERMANENTS:** the alt-cast spec demanded a HIGH cast program, which a creature never has (its text is
>   a body plus triggers) — so no permanent had ever been offered an alt cost. For the evoke shape the spec now reads the
>   alt cost straight off the oracle for a permanent card (the spell-side alt costs keep their program gate); a mutant that
>   removed the gate was seen to fail.
> · "When this creature enters, exile up to one other target creature. That creature's controller gains life equal to its
>   power. / Evoke—Exile a white card from your hand." Two seams. (1) Targeted removal did not know "other"/"another": a
>   recursive peel at the removal parser's head parses the plain form and adds the not-source restriction, stamping the
>   "up to one" bounds itself (the program parser's own up-to-one peel never reaches a rider lead); the controller-rider
>   matcher's lead admits the up-to-one / other forms. (2) EVOKE (CR 702.74) modelled end to end: a cast-modifier entry
>   makes the pitch the exile-a-colour-card alt cost with an `evoke` flag; the flag rides the cast action, the dispatcher
>   stamps the cast, the entry resolver stamps the permanent and queues the "sacrifice it" trigger at the FRONT of the
>   pending triggers — under the card's own ETB, so the exile resolves and then the evoked body dies (a mutant that queued
>   it on top was seen to fail). The classifier admits the pitch-evoke line as modelled residue (the mana-cost evoke line
>   stays the inert allowance it was).
> · **Pins:** the hard cast exiles their Ogre, they gain 4, Solitude stays; the evoke cast is offered with no mana and a
>   white card, the pitch is exiled, the Ogre is exiled and they gain 4, THEN Solitude is in the graveyard; the evoked stamp
>   and the queue order; no white card → no evoke cast. Mutants: the peel, the dropped not-source, the rider lead, the
>   modifier, the unthreaded flag, the dispatcher memo, the unqueued sacrifice, the wrong queue order, the classifier line.
> · Subtlety and Endurance (Believe it! / Kinnan leftovers) now park only on their own ETB atoms — evoke no longer blocks them.
> · **CI:** blocked — repo PRIVATE (billing), zero-step failures; committed locally on full gates, push on the first green run ([Q-CI2])
> · **🏁 SHALAI 84 → 85 — AT THE BAR (85/100).** Killer Turts 85 ✅ · Kinnan 85 ✅ · Believe it! 85 ✅. Next: the §5 shelf order.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · BI-5: MOON-CIRCUIT HACKER + SATORU — the ninja draw engine · **+2** · corpus 14486 / 34,245
> Suite **1502/16171** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **10/10 killed.**
> · Moon-Circuit Hacker — "…you may draw a card. If you do, discard a card unless this creature entered this turn." The
>   optional draw-then-discard arm accepts the unless-tail; the resolver reads the source's entered-this-turn stamp at
>   resolution and raises the draw alone for a fresh ninja.
> · Satoru — "Whenever Satoru and/or one or more other nontoken creatures you control enter, if none of them were cast or no
>   mana was spent to cast them, draw a card." Four seams. (1) The "one or more … enter" batch form is refused by design
>   unless the card prints its own once-per-turn rider (the approximation would over-fire); Satoru prints none, so a real
>   ONCE PER BATCH: the enter checker drops a second firing while an unflushed pending trigger from the same watcher and
>   descriptor waits — simultaneous entries fire once, separate resolutions fire separately. (2) A self-or-other scope that
>   accepts the card's printed short name ("satoru") as the self half — the condition keeps it. (3) The predicate reads the
>   ENTERING permanent's arrival stamps: `wasCast` was there; `castForNoMana` is new, threaded from the dispatcher's payment
>   plan through the entry resolver onto the permanent — a free or alt-cost cast counts as no mana spent. (4) The trigger
>   splitter did not know the plural "enter" as an event verb, passed over the first comma, and split inside the
>   intervening-if where "…were cast" read as a cast event — `enters?` now.
> · **Pins:** a creature put from hand fires (the ninjutsu shape) and I draw; one cast with mana does not; a free alt-cost
>   cast is stamped and fires; Satoru's own entry fires; a token never; two entries before a flush leave ONE pending trigger
>   and one draw, a third after the flush draws again; the predicate is null without an entering permanent. Mutants: the
>   unstamped rider, an always-drop discard, the arm, a self-excluding scope, the dedupe, an always-true predicate, the
>   unthreaded and the unstamped no-mana flag, the singular-only splitter and the dispatcher's missing memo.
> · **CI:** blocked — repo PRIVATE (billing), zero-step failures; committed locally on full gates, push on the first green run ([Q-CI2])
> · **🏁 BELIEVE IT! 83 → 85 — AT THE BAR (85/100). ALL THREE POD-SIM DECKS AT 85: Killer Turts 85 · Kinnan 85 · Believe it! 85.** Shalai 84. (Full suite: the saboteur witness's Hacker guard graduated; every other file green.) Next: Colton's second order — the three decks' Arbiter leftovers to Omnath's nuance queue; then Shalai's last card.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · BI-4: FLARE OF MALICE + CONTAGION — a greatest-MV edict and per-axis counters · **+7** · corpus 14484 / 34,245
> Suite **1501/16165** green; lint 0. Flip-diff **+7, zero LOST** — five unplanned twins audited whole-card: Soul Shatter
> (Flare's exact sentence), Elven Rite and Splendid Agony (two +1/+1 / two -1/-1 among one or two target creatures), Abzan
> Charm (its third mode) and Wurmskin Forger (three among one, two, or three). **10/10 killed.**
> · ⚠️ **HOLLOW GROUP CLOSED:** the general distribute resolver built its candidates from the CONTROLLER's creatures only,
>   whatever the atom's `group` said — the any-creature group the Court of Garenbrig arm declared in August never reached
>   the pause. Every "distribute … among target creatures" now offers every player's creatures (pinned: their Bear and
>   Ogre and my Bear are all candidates; the hollow form was seen to fail).
> · Flare of Malice — "Each opponent sacrifices a creature or planeswalker with the greatest mana value among creatures and
>   planeswalkers they control." A creature-or-planeswalker sacrifice pool and a `greatestMv` flag that rides each queue
>   entry into the sacrifice chain, which narrows the sacrificer's pool to their top mana value before the forced-or-pause
>   choice (tokens are 0, CR 202.3; a tie stays the sacrificer's choice). The clause splitter cut the sentence at the "and"
>   inside the selector — kept whole. The sacrifice-a-nontoken-black-creature alt cost was already modeled.
> · Contagion — "Distribute two -2/-1 counters among one or two target creatures." Two misses: the distribute arm knew only
>   +1/+1 among creatures YOU control; and the engine's counter delta knew only ±1/±1 — a -2/-1 counter would have sat on a
>   creature changing nothing (an FP waiting to happen). Counter deltas are PER AXIS now: every "±a/±b" counter contributes
>   a×n to power and b×n to toughness, at all five sites (the printed-with-counters pair, the two layer paths, the game-state
>   pair). The distribute fallback prefers the opponents' creatures when the counter is harmful. The pay-1-life-and-exile-a-
>   black-card pitch composes.
> · **Pins:** two -2/-1 on their 4/4 = 0/2; one on each of two creatures; the fallback never picks my own creature for a
>   harmful counter; the pitch offered with no mana. Flare: Ogre (4) and Jace (4) tied above a Bear (2) → the pause offers
>   exactly those two; a lone greatest is forced; the alt cost offered with no mana and a black nontoken creature. Mutants:
>   the +1/+1-only arm, forced you-control, a power delta reading the toughness part, the legacy symmetric layer delta, a
>   fallback that harms my own, the Flare arm, the dropped narrowing, a pool without planeswalkers, the re-split sentence and
>   the hollow group — all died. Two first SURVIVED as witness gaps, not dead code: the layered path only runs when a
>   continuous effect touches the creature (pinned under their own anthem: 1/3), and the side-aware fallback was never
>   forced while my creature was not the biggest (pinned with a 5/5 of my own).
> · **CI:** blocked — repo PRIVATE (billing), zero-step failures; committed locally on full gates, push on the first green run ([Q-CI2])
> · **Believe it! 81 → 83 (needs 2)** · Killer Turts 85 ✅ · Kinnan 85 ✅ · Shalai 84. (Full suite: three guards graduated — the distribute parks, Biogenic Upgrade's first sentence, and the simplified Flytrap fixture; the PRINTED Flytrap still parks on its doubling sentence and is now pinned as such.) Next: BI-5 Moon-Circuit Hacker + Satoru — the last two slots.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · BI-3: FORCE OF DESPAIR + SEA GATE RESTORATION — two fills · **+3** · corpus 14477 / 34,245
> Suite **1500/16160** green; lint 0. Flip-diff **+3, zero LOST** — one unplanned twin audited whole-card: Praetor's Counsel
> (return all from graveyard + exile itself + the same rest-of-game rider, now the flag atom behind its self-exile). **7/7 killed.**
> · Force of Despair — "Destroy all creatures that entered this turn." The generic mass-destroy arm could not read the
>   phrase; a dedicated arm narrows the each-creature destroy by the shared entered-this-turn restriction (the
>   `enteredOnTurn` stamp the damage doubler already reads). The "if it's not your turn, exile a black card" pitch was
>   already modeled and composes (pinned both ways).
> · Sea Gate Restoration — "Draw cards equal to the number of cards in your hand plus one. You have no maximum hand size
>   for the rest of the game." The hand-count draw gains a PLUS constant through the shared scaled-amount reader. The
>   rest-of-game rider had been STRIPPED at the clause level since before cleanup discard existed ("cleanup discard is
>   unimplemented" in the strip's own comment); the cleanup step is real now, so the program-level peel appends a FLAG
>   atom that sets a player flag the cleanup read honours for the rest of the game — a fidelity gap closed for every
>   spell that prints the rider, not only this one (the modal card's land back was already whole).
> · **Pins:** only the two creatures that entered this turn die (mine and theirs), the two older ones live; castable on the
>   opponent's turn with no mana by exiling a black card, not on my own; three other cards in hand draw four; the flag is
>   set; cleanup keeps twelve with the flag and would discard six without it. Mutants: the arm, the dropped restriction,
>   plus-as-zero, the plus-blind reader, the unappended flag, the flag-less resolver and the flag-blind cleanup — all died.
> · **CI:** blocked — repo PRIVATE (billing), zero-step failures; committed locally on full gates, push on the first green run ([Q-CI2])
> · **Believe it! 79 → 81 (needs 4)** · Killer Turts 85 ✅ · Kinnan 85 ✅ · Shalai 84. Next: BI-4 Flare of Malice + Contagion.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · BI-2: DEMONIC CONSULTATION + TAINTED PACT — the Believe it! win · **+3** · corpus 14474 / 34,245
> Suite **1499/16156** green; lint 0. Flip-diff **+3, zero LOST** — one unplanned twin audited whole-card: Divining Witch
> (Consultation's exact text behind a "{1}{B}, {T}, Discard a card" activation). **11/11 killed** — the five-not-six mutant
> first SURVIVED behind a library where either count met the same names; a sixth-card pin (the exact sixth is never
> revealed; the seventh is the first found) now kills it.
> · Demonic Consultation — "Choose a card name. Exile the top six cards of your library, then reveal cards from the top of
>   your library until you reveal a card with the chosen name. Put that card into your hand and exile all other cards
>   revealed this way." ONE atom. The NAME is a real decision, so it rides the existing tutor pause in a consultation
>   mode: one candidate per DISTINCT library name (the first card of each name stands for it), and the tutor panel's
>   decline is "a name not in your library" — which exiles the whole library, the actual Thassa's Oracle line. The settle
>   branches before any tutor semantics: exile six, reveal until the name (to hand), exile the rest. NOT a search: the
>   library-search event is never emitted (pinned against an opponent's Wan Shi Tong).
> · Tainted Pact — "Exile the top card of your library. You may put that card into your hand unless it has the same name
>   as another card exiled this way. Repeat…" ONE atom and a NEW pause kind, `tainted-pact` (the Sylvan chain's shape):
>   each exiled card asks take-or-continue; a duplicate name ends the dig with nothing; an empty library ends it quietly.
>   Wired on every half — the server settle, the AI driver branch (fallback: take a nonland), the session apply, the hook
>   callback and the side-sheet panel — so the human path and the pod sim both settle it. (Not added to
>   PENDING_CHOICE_KINDS, exactly like the Sylvan kind — the wire passes the whole decision.)
> · **Pins:** nine distinct names offered from ten cards; the Oracle behind the six is found with seven exiled and two
>   untouched; declining exiles all ten; a name inside the six exiles everything; continue-continue-take; the duplicate
>   Alpha ends the dig with the Oracle still in the library; the AI seat settles by policy and never spins. Mutants: both
>   templates, duplicate candidates, five-not-six, a reveal that never stops, consultation-blind settle, the lost
>   duplicate stop, a take that never moves, forgotten names, a land-taking policy and the missing driver branch.
> · **CI:** blocked — repo PRIVATE (billing), zero-step failures; committed locally on full gates, push on the first green run ([Q-CI2])
> · **Believe it! 77 → 79 (needs 6)** — the win is playable end to end. Killer Turts 85 ✅ · Kinnan 85 ✅ · Shalai 84. Next: BI-3 Force of Despair + Sea Gate Restoration.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KN-5b: WAN SHI TONG — an X-reading ETB + the library-search event · **+2** · corpus 14471 / 34,245
> Suite **1498/16148** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **7/8 killed + 1 documented survivor.**
> · "When Wan Shi Tong enters, put X +1/+1 counters on him. Then draw half X cards, rounded down. / Whenever an opponent
>   searches their library, put a +1/+1 counter on Wan Shi Tong and draw a card." Three seams: (1) the cast lane only
>   enumerated X for an enters-with-X body or a clone; an ETB that READS X now qualifies too (the chosen X already reached
>   the trigger as its self context — nobody was choosing it); (2) "put X +1/+1 counters on this creature" and "draw half
>   X cards, rounded down" read the context's X through the shared scaled-amount reader — the self-counter resolver's
>   second path scaled only for a count context and silently put ONE counter for any X (seen to fail, fixed);
>   (3) a LIBRARY-SEARCH event. The shuffle chokepoint could not carry it — plain shuffles, wheels and scry shuffles all
>   pass through it and are not searches — so the event is emitted by the two tutor sites only: the no-pause tutor path
>   and the tutor-pause settle (a fruitless search that declines its pause is still a search, CR 701.19b).
> · **Pins:** X = 1..5 offered with two blue and five colourless (never 0); X = 3 enters with three counters and draws one,
>   X = 4 draws two; the opponent's tutor fires +1 and a draw at the settle; a fruitless opponent search fires; my own search
>   never does. Mutants: the X arm, the rounding, the amountX-blind resolver, the descriptor, the own-seat leak, the settle's
>   emission and the X gate — all died. ONE DOCUMENTED SURVIVOR: the no-pause tutor path's emission — that branch is the
>   count-zero dynamic tutor (a "search for up to X" with X = 0), which no witness reaches; every tutor in the witness set
>   raises the pause (a fruitless search included) and is caught at the settle. The emission there mirrors the settle's
>   line for line. Twin audited whole-card: Archivist of Oghma (Flash; the same bare trigger, gain 1 and draw).
> · **CI:** blocked — repo PRIVATE (billing), zero-step failures; committed locally on full gates, push on the first green run ([Q-CI2])
> · **🏁 KINNAN 84 → 85 — AT THE BAR (85/100), the second of the pod-sim three.** Believe it! 77 (needs 8) · Killer Turts 85 ✅ · Shalai 84. (Full suite: the half-X witness parked Wan Shi Tong on the undetected search trigger — graduated; every other file green.) Next: RUNBOOK-BELIEVE-IT BI-2 Demonic Consultation + Tainted Pact — THE WIN.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KN-6a: SINK INTO STUPOR — the union bounce narrowed · **+1** · corpus 14469 / 34,245
> Suite **1497/16143** green; lint 0. Flip-diff **+1, zero LOST**. **5/5 killed.**
> · "Return target spell or nonland permanent an opponent controls to its owner's hand." (the modal card's instant face —
>   the land back, Soporific Springs, was already whole; the front was the only park.) The Venser stack-or-battlefield
>   union knew one shape; the narrowed twin carries a spell-controller filter (an OPPONENT's spell only — the mirror of the
>   existing "you" filter) and battlefield restrictions (nonland, opponent-controlled) evaluated by the shared satisfier.
>   Both had to be THREADED through the union's targeting spec — the unlisted-equals-dropped trap the Venser arm itself
>   documents — or the card would have bounced a land or its caster's own spell.
> · **Pins:** offered targets are exactly the opponent's spell, Ogre and Sol Ring — never their Island, my bear, or my own
>   spell on the stack; the Ogre bounces to THEIR hand; the spell leaves the stack into their hand. Mutants: the arm, the
>   dropped restrictions, the dropped controller filter, the blind enumerator and the missing nonland — all died.
> · **CI:** blocked — repo PRIVATE (billing), zero-step failures; committed locally on full gates, push on the first green run ([Q-CI2])
> · **Kinnan 83 → 84 (needs 1)** · Believe it! 76 · Killer Turts 85 ✅ · Shalai 84. (Full suite: the modal-land witness used Sink into Stupor as its 'unmodeled front' example — two tier guards graduated and its cast test rewritten into a positive pin; every other file green.) Next: KN-5b Wan Shi Tong — the last slot.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KN-4: TREASURE VAULT + MOONSILVER KEY + CEPHALID COLISEUM — three fills · **+7** · corpus 14468 / 34,245
> Suite **1496/16140** green; lint 0. Flip-diff **+7, zero LOST** — four unplanned twins of the draw-then-discard fold
> audited whole-card: Cephalid Broker (two/two), Cephalid Looter and Reckless Scholar (a card / a card), Wistful Thinking
> (draws two, discards FOUR — the discard clamps to the hand as every discard does). **8/8 killed.**
> · Treasure Vault — "{X}{X}, {T}, Sacrifice this land: Create X Treasure tokens." The activation-cost parser knew a
>   single {X}; a RUN of X pips now carries every pip into the mana cost so the X lane owes 2X for the chosen X (CR 107.3),
>   and the bare "Create X Treasure tokens" (no "where X is") reads X off the activation.
> · Moonsilver Key — "an artifact card with a mana ability or a basic land card" → hand. A dedicated tutor arm whose
>   artifact group carries a MANA-ABILITY demand: the matcher reads the card's own "…: Add …" line (a Sol Ring qualifies,
>   Swiftfoot Boots does not; an odd phrasing simply does not qualify — FN-safe); the other group is basic land.
> · Cephalid Coliseum — the mana line was already credited (the ping-land arm). Threshold: a new intervening-if arm,
>   "N or more cards in your graveyard", read at activation through the same gate every conditional activation uses.
>   "Target player draws three cards, then discards three cards" is ONE atom for the SAME chosen player — two atoms would
>   each take their own target, and the "that player" pronoun path reads the damaged player; the sentence is kept whole
>   past the comma-then splitter (its removal seen to fail).
> · **Pins:** the Vault offers X = 1..3 at 2/4/6 with six in the pool and nothing with one; X = 2 makes two Treasures and
>   sacrifices the land. The Key's pause offers Sol Ring + Island only (never Boots, Command Tower or a creature), the pick
>   reaches hand, the Key is gone. The Coliseum is not offered at six graveyard cards and is at seven; aimed at the
>   opponent, their library −3 / graveyard +3 / hand unchanged, the land sacrificed. Mutants: the pip-run arm, the bare-X
>   count, draw-nothing, skip-the-discard, strict-threshold, the dropped mana demand, the blind matcher and the re-split
>   sentence — all died.
> · **CI:** blocked — repo PRIVATE (billing), zero-step failures; committed locally on full gates, push on the first green run ([Q-CI2])
> · **Kinnan 80 → 83 (needs 2)** · Believe it! 76 · Killer Turts 85 ✅ · Shalai 84. (Full suite: three pre-existing guards asserted the double-X cost and the draw-then-discard sentence UNMODELED — graduated and re-run green; every other file green.) Next: KN-5/6 — the last two slots.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KN-3: FLASH PHOTOGRAPHY + IMPOSTER MECH — the copy family whole · **+3** · corpus 14461 / 34,245
> Suite **1495/16136** green; lint 0. Flip-diff **+3, zero LOST** (any unplanned gains audited whole-card). **11/11 killed.**
> · Flash Photography — "Create a token that's a copy of target permanent." The token-copy atom knew "target creature you
>   control"; a `target permanent` arm now copies any permanent of any controller through the same snapshot path (a token
>   Sol Ring, a token land, a second bear). An Aura or a Saga is never a legal TARGET (an Aura token needs an attach choice
>   the token path does not raise, CR 303.4f; a Saga token needs its lore counter, CR 714.2) — the pool is narrower than
>   printed rather than a token that enters wrong. The card's own "as though it had flash if it targets a permanent you
>   control" line is stripped by the normalizer and NOT honored — sorcery-speed only, a documented false negative.
> · Imposter Mech — "You may have this Vehicle enter as a copy of a creature an opponent controls, except it's a Vehicle
>   artifact with crew 3 and it loses all other card types." Three misses: the head did not know "this vehicle"; no
>   opponent-creature scope (added — the enumerator skips your own seat, the settle re-checks the controller); no rider for
>   the Vehicle rewrite (added — the type line becomes exactly `Artifact — Vehicle`, a non-creature keeps no creature
>   subtypes per CR 205.3d, the creature's P/T stays, a Crew N line is appended that the crew parser reads like a printed
>   one; "it loses all other card types" is the same rewrite, idempotent). And the printed trailing Crew line defeated the
>   head's end anchor — stripped before the match (TRAILING only: a first, wider strip ate the rider's own "with crew 3" and
>   was seen to fail). The non-creature clone gate admits the opponent scope only when a become-Vehicle rider keeps the
>   copy a non-creature — a creature-becoming non-creature card stays parked.
> · ⚠️ **HOLLOW NATIVE CLOSED (found by the twin audit):** the flip-diff's unplanned gain, Malleable Impostor ("Flash /
>   Flying / …enter as a copy of a creature an opponent controls, except…"), was credited by the classifier through its
>   keyword-stripped retry (the 08-04 Stunt Double allowance) while the RUNTIME clone gate read the raw text and never
>   raised the copy pause — a credited card that entered as a plain body. The clone-shape view now consumes a leading
>   "flash" token itself (the card keeps its Flash for the cast path), so classifier and runtime share one view; pinned
>   at runtime (the pause is raised, the copy is a flying Faerie Shapeshifter Ogre) and the token's removal was seen to fail.
> · **Pins:** Photography's targets are exactly Ogre + Sol Ring + Island + my bear; their Sol Ring copied is MY artifact
>   token, not a creature, theirs untouched; the Mech's pause offers only the Ogre, becomes a 4/4 Artifact — Vehicle with
>   crew 3 that is not a creature, and refuses my own bear (enters as itself; declining likewise). Mutants: the Photography
>   regex, its exclusions, the head scope, the scope map, the own-seat skip, the type rewrite, the Crew line, the clone
>   gate, the settle's controller check and the trailing strip — all died.
> · **CI:** blocked — repo PRIVATE (billing), zero-step failures; committed locally on full gates, push on the first green run ([Q-CI2])
> · **Kinnan 78 → 80 (needs 5)** · Believe it! 76 · Killer Turts 85 ✅ · Shalai 84. Next: KN-4 Treasure Vault · Moonsilver Key · Cephalid Coliseum.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KN-2: CLEVER IMPERSONATOR + COPY ENCHANTMENT — the clone family widened · **+2** · corpus 14,458 / 34,245
> Suite **1494/16129** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **6/6 killed.**
> · "You may have this creature enter as a copy of any nonland permanent on the battlefield." / "…this enchantment enter as
>   a copy of any enchantment on the battlefield." The native-clone head knew creatures, artifacts and Equipment; it now
>   admits the NONLAND scope and the ENCHANTMENT scope through ONE shared copiability reader used by both the enumerator
>   and the settle (the settle re-checks the pick — a wrong id enters the clone as itself, never as the wrong thing).
>   Auras and Sagas are never offered under either scope: an Aura copy needs an attach choice the entry path does not
>   raise (CR 303.4f) and a Saga copy needs its lore counter on entry (CR 714.2) — both unmodeled, so the pool is
>   narrower than printed (false-negative safe) rather than a copy that enters wrong (an FP). A copied static APPLIES —
>   the runbook's bar — because the copy snapshots the whole card and the static layer reads it like any other permanent.
> · **Pins:** the enchantment pool is exactly the anthem; the nonland pool is anthem + bear + Sol Ring + planeswalker (no
>   Aura, no Saga, no land); Copy Enchantment as Glorious Anthem makes MY bear 3/3, declining leaves it 2/2, the Aura pick
>   is refused; Clever Impersonator as a Sol Ring becomes an ARTIFACT, as the anthem pumps my bear, and the land pick enters
>   it as a 0/0 that dies. The pre-existing CREED guard test graduated from "parked" to "native". Mutants: the head regex,
>   the scope map, the Aura/Saga exclusion, the settle's re-check, the clone gate and the enumerator's reader — all died.
> · **CI:** blocked — repo PRIVATE (billing), zero-step failures; committed locally on full gates, push on the first green run ([Q-CI2])
> · **Kinnan 76 → 78 (needs 7)** · Believe it! 76 · Killer Turts 85 ✅ · Shalai 84. Next: KN-3 Flash Photography + Imposter Mech. (Full suite: one pre-existing clone guard asserted the enchantment scope PARKED — graduated to native and re-run green; every other file green.)

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KN-1: THASSA'S ORACLE — one atom, X read live · **+1** · corpus 14,456 / 34,245
> Suite **1493/16,124** green; lint 0. Flip-diff **+1, zero LOST**. **8/8 killed.**
> · "When this creature enters, look at the top X cards of your library, where X is your devotion to blue. Put up to one of
>   them on top of your library and the rest on the bottom of your library in a random order. If X is greater than or equal
>   to the number of cards in your library, you win the game." The three sentences share X, so they are ONE atom
>   (`devotion-dig-win`): X is the existing devotion count (the Gods' — hybrid pips count, the Oracle's own {U}{U}
>   included) read at RESOLUTION, CR 608.2c — the runbook's named FP was a stale X. X ≥ library → the win-game stamp
>   (CR 104.2a, state-based end) and the look is skipped (nothing downstream can read the order once the game is over);
>   otherwise the impulse-dig pause with a new TOP destination — the pick stays on top, the other looked-at cards bottom in
>   the shared mover's seeded random order (re-stacked as [others, kept, rest] so the mover's own shuffle does the work) —
>   and a non-candidate answer declines ("up to one"). A devotion of zero looks at nothing; an EMPTY library with X = 0 still
>   wins (0 ≥ 0 — the Demonic Consultation line, the win the pod sim exists to reproduce).
> · **Pins:** four candidates over six cards, the pick on top, three under the untouched two; decline bottoms all four; four
>   over three wins with no pause; a two-pip permanent arriving between trigger and resolution turns a look into a win while
>   the control only looks; the Oracle bounced in response wins an empty library and looks at nothing over one card.
>   Mutants: the colour map, strict-greater, a constant X, an unstamped win, top-downgraded-to-hand, kept-bottomed, bottoms-
>   nothing and a zero-look pause — all died.
> · **CI:** blocked — repo PRIVATE (billing), zero-step failures; committed locally on full gates, push on the first green run ([Q-CI2])
> · **Kinnan 75 → 76 (needs 9) · Believe it! 75 → 76 (needs 9)** — Thoracle native in both. Killer Turts 85 ✅ · Shalai 84. Next: KN-2 Clever Impersonator + Copy Enchantment (clone scope widening).

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KT-9b: NOT OF THIS WORLD — the spell-or-ability counter union + a TARGET-CONDITIONAL cost · **+3** · corpus 14,455 / 34,245
> Suite **1492/16,117** green; lint 0. Flip-diff **+3, zero LOST** (twins Diplomatic Escort + Siren Stormtamer audited whole-card). **8/8 killed.**
> · "Counter target spell or ability that targets a permanent you control. This spell costs {7} less to cast if it targets a
>   spell or ability that targets a creature you control with power 7 or greater." Two seams: (1) the SPELL-OR-ABILITY
>   union as a COUNTER — its own targeting-spec kind (the union's only prior kind was Deflecting Swat's retarget, which
>   carries `notCounter`; a counter must not), `targetsFilter` threaded explicitly (unlisted = dropped = a counter that hits
>   anything), and the targets-what predicate now applied to a stack ABILITY's recorded targets too; the resolver dispatches
>   a spell down `counter` and an ability down `counter-ability`. (2) the reduction depends on the TARGET chosen at cast, so
>   it is peeled and STAMPED on the program (the strive discipline in the other direction) and settled per chosen target in
>   the cast lane — the affordability gate lets the card through on its best-case cost, each choice re-checks at its settled
>   cost, MV stays printed (CR 202.3), power is layer-aware (counters count).
> · **Pins:** {7} against a spell aimed at your 2/2 (not offered on an empty pool); {0} against one aimed at your 7-power
>   creature, and at a 5/5 wearing two +1/+1 counters; a 6-power earns nothing; a spell is countered to its owner's
>   graveyard, an ability leaves the stack, and neither is offered when aimed at the opponent's own permanent or at you as a
>   player. Mutants: the arm, the spec fallback to retarget, the ability-side filter, the unstamped reduction, the gate, the
>   boundary, the never-reduce and the mis-routed resolver — all died.
> · **CI:** blocked — repo PRIVATE (billing), zero-step failures; committed locally on full gates, push on the first green run ([Q-CI2])
> · **Killer Turts 84 → 85 — AT THE BAR (85/100), the first of the pod-sim three.** Kinnan 75 · Believe it! 75 · Shalai 84 (Solitude). Next: Kinnan per RUNBOOK-KINNAN (KN-1 Thassa's Oracle).

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KT-10a: CARPET OF FLOWERS — four seams for one mana enchantment · **+8** · corpus 14,452 (42.2%) / 34,245
> Suite **1491 files / 16,110 tests** green; lint 0. Flip-diff **+8, zero LOST** (any unplanned gains audited whole-card). **9/9 killed (the engine-hook mutant survived once → a stepping pin added → killed).**
> · "At the beginning of each of your main phases, if you haven't added mana with this ability this turn, you may add X mana of
>   any one color, where X is the number of Islands target opponent controls." Four misses, none of them the card's fault:
>   (1) a BOTH-mains event — the scheduler knew first / second; `anyMain` now fires at every main of your turn, extra ones
>   included; (2) the once-per-turn LATCH — a per-ability stamp the add-mana resolver writes under a keyed trigger context
>   (the resolution memo counts resolutions even when the intervening-if fails, so it could not serve), read by the
>   intervening-if (fails CLOSED without a key), cleared at untap; (3) an X-of-ONE-colour add over the TARGET opponent's
>   lands of a basic type (a new count kind), read at resolution, nothing on zero; (4) opponent-targeted trigger EFFECTS
>   were unresolvable for the trigger chooser — any opponent-targeted atom is now enemy-side (which opponent is a
>   play-quality choice). Theft of Dreams' known draw arm was parked by (4) too and rides along.
> · **Pins:** three of one colour from three Islands, the Forest uncounted; nothing at the second main the same turn; again
>   next turn; nothing and no stamp with no Islands; the fail-open, never-stamp, turn-blind, all-lands, spread-colours and
>   no-intent mutants all died.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Killer Turts 83 → 84** (84/100; needs 1). Seven unplanned gains audited whole-card (opponent-targeted trigger effects: Ms. Bumbleflower, Farsight Adept, Soldevi Steam Beast, Persuasive Interrogators, Flumph, Sphinx of Enlightenment, Venerated Rotpriest — Sphinx and Bumbleflower runtime-checked). Next: the last Turts slot.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KT-7b: FULL THROTTLE — a count and a repeating delayed record · **+1** · corpus 14,444 (42.2%) / 34,245
> Suite **1490 files / 16,106 tests** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **9/9 killed + 1 dead-code deletion (a re-entry drain the step-actions drain already covered); the 08 extraCombatAtom pin on the counted grant GRADUATED.**
> · "After this main phase, there are two additional combat phases." — the after-main extra combat with a COUNT; the resolver
>   queues that many entries (CR 500.8).
> · "At the beginning of each combat this turn, untap all creatures that attacked this turn." — the delayed-trigger scheduler
>   knew upkeep / end / main / cleanup and consumed each record. It gains a REPEATING record: fire step beginning-of-combat,
>   yours only, KEPT for every matching step of the turn it was created in and lapsing silently once the turn moves on.
>   runStepActions drains the new step on EVERY advance, the re-entered beginning-of-combat of an extra combat included — a
>   second drain I wrote on the re-entry path survived its mutant, was dead code (a double fire), and was removed.
> · **AFTER-MAIN FIDELITY (the engine change this slice forced):** the after-main pop fed EVERY extra combat into the postcombat
>   main and DROPPED the turn's normal combat — Full Throttle gave two combats, and Relentless Assault's after-main form gave
>   one where the card says two. The extra-combat entry now carries whether a main follows it (`withMain`, from the printed
>   "followed by an additional main phase"); leaving the precombat main into an extra sequence marks the normal combat as
>   OWED; a no-main extra combat chains straight to the next combat at its end; the owed normal combat happens after the
>   sequence (CR 500.8), and the flags reset with the turn. Existing pins re-anchored on the carried flags.
> · **Pins:** three combats in the turn with the attacker untapped at the start of each; the record gone next turn; the
>   fire-once, count-ignored, next-turn-survivor, owed-never-marked, no-chain and main-slips-between mutants all died.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Killer Turts 82 → 83** (83/100; needs 2). Next: the last two — Carpet of Flowers / World War Hulk / Veil of Summer / Not of This World, cheapest first.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KT-9a: AVOID FATE — the typed counter-that-targets · **+2** · corpus 14,443 (42.2%) / 34,245
> Suite **1489 files / 16,104 tests** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **4/4 killed + 1 EQUIVALENT documented (the resolution-side mirror line: unknown filters are permissive there by design).**
> · "Counter target instant or Aura spell that targets a permanent you control." The runbook sized this M for a new
>   stack-object predicate — the predicate already existed (the CNT-TARGETS-WHAT family reads a spell's RECORDED targets;
>   "a permanent you control" was on its table). The miss was only the spell-TYPE prefix: a typed arm with a new
>   `instantOrAura` filter value that both evaluators (the enumerator's and the resolver's) know. A sorcery aimed at your
>   permanent, or an instant aimed at the opponent's, is never a target (the mutants that dropped either filter died; the
>   evaluators that matched anything died).
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Killer Turts 81 → 82** (82/100; needs 3). Unplanned gain audited: Ring of Immortals (Avoid Fate's sentence as an activated ability). Next: the last three — Carpet of Flowers / Jeweled Amulet / Full Throttle / Not of This World, cheapest first.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KT-8: GRIM REAPER'S SPRINT — morbid joins the self-metric seam · **+3** · corpus 14,441 (42.2%) / 34,245
> Suite **1488 files / 16,101 tests** green; lint 0. Flip-diff **+3, zero LOST** (any unplanned gains audited whole-card). **6/6 killed.**
> · The aura's ETB ("untap each creature you control. If it's your main phase, there is an additional combat phase after
>   this phase") already rode KT-7a's gated arm; only "Morbid — This spell costs {3} less to cast if a creature died this turn"
>   stood in the way. The cast lane's self-metric reader (Ghalta / Shadow of Mortality) gains a FIXED kind gated on any
>   creature having died this turn — every seat's counter (CR 700.4: the card says "a creature", not "a creature you
>   control"; the your-deaths-only mutant died). The ability-word label is peeled so the sentence reaches the table; the
>   aura residue check treats the modeled sentence as not-residue; coverage strips it by the same reader.
> · **Pins:** for {R}{R} the Aura is not castable with no death this turn and IS castable after a death under either seat;
>   the full cost still works; entering in your main phase untaps and queues the extra combat, entering in combat queues none.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Killer Turts 80 → 81** (81/100; needs 4). Unplanned gains audited: Purple Worm and Bone Picker (the unlabelled morbid sentence + keywords only). Next: KT-9 Avoid Fate (the typed counter-that-targets), then KT-7b Full Throttle, then Not of This World / Carpet of Flowers.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KT-7a: OVERPOWERING ATTACK — the attacked-this-turn untap and the gated extra combat · **+1** · corpus 14,438 (42.2%) / 34,245
> Suite **1487 files / 16,098 tests** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **7/7 killed.**
> · "Untap all creatures you control that attacked this turn." — the creature untap filtered on the per-permanent
>   attackedThisTurn flag (stamped at declare-attacker, cleared at untap); a creature that stayed home never untaps (pinned).
> · "If it's your main phase, there is an additional combat phase after this phase, followed by an additional main phase." —
>   the after-main extra combat with a RESOLUTION-TIME gate: outside your main phase (or in an opponent's) nothing is queued —
>   never an extra combat the card does not grant. The same arm will carry Grim Reaper's Sprint's aura ETB (KT-8).
> · Freerunning is credited hard-cast only (the foretell/blitz alt-cast precedent) — a known, documented under-offer.
> · **Sized in passing:** Full Throttle's "at the beginning of each combat this turn, untap all creatures that attacked" needs a
>   NEW delayed-trigger fire step (the scheduler knows upkeep / end / main / cleanup and consumes each record) — an M row;
>   World at War's rebound is unmodeled — parked within KT-7.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Killer Turts 79 → 80** (80/100; needs 5). Next: KT-8 Grim Reaper's Sprint (its aura ETB now rides the gated arm; only the MORBID cost reducer is missing), then KT-7b Full Throttle, KT-9 Avoid Fate + Not of This World.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KT-6: SAVAGE BEATING — the cast window · **+1** · corpus 14,437 (42.2%) / 34,245
> Suite **1486 files / 16,095 tests** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **6/6 killed.**
> · "Cast this spell only during combat on your turn." Both modes and entwine already parsed; the sentence itself was residue
>   that kept the whole spell on the Arbiter. It now comes off the way strive does and is STAMPED on the program as
>   `castTiming: { phase: "combat", yourTurn: true }`; legalChoices' offer loop refuses the cast outside the window (CR 601.3).
>   ⛔ The stamp is the point — peeling without stamping would offer Savage Beating in a main phase, the forbidden over-offer;
>   that mutant, the ignored-stamp mutant, the wrong-turn mutant and the wrong-phase mutant all died.
> · **Pins:** offered during your combat; never in your main phase; never during the opponent's combat; cast in combat,
>   the double-strike mode resolves.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Killer Turts 78 → 79** (79/100; needs 6). Next: KT-7a Overpowering Attack (the attacked-this-turn untap + a main-phase-only extra combat), then KT-7b Full Throttle (a per-combat delayed untap — a new fire step).

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KT-4b: OPEN THE OMENPATHS — the two-colour restricted add · **+1** · corpus 14,436 (42.2%) / 34,245
> Suite **1485 files / 16,092 tests** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **5/5 killed.**
> · Mode 1 "Add two mana of any one color and two mana of any other color. Spend this mana only to cast creature or enchantment
>   spells." — a restricted add whose colours are a CHOICE. House policy, deterministic and documented (the riot discipline):
>   the first colour is the any-colour policy's pick (the commander's colour identity in WUBRG order), the second the next
>   DISTINCT identity colour, else the next WUBRG colour that is not the first. ONE tagged `restrictedMana` entry {c1: 2, c2: 2}
>   the planner honours; a suboptimal pair is a play-quality loss only, never more mana than printed. Mode 2 (the team
>   pump) already parsed.
> · **Pins:** R/G under a red-green commander; W/R under mono-red (two distinct colours always); four mana, never more; the
>   entry pays a creature and never an instant. Mutants: the same-colour-twice, the 3+1 split, the dropped restriction, and
>   the unrestricted any-colour arm all died.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Killer Turts 77 → 78** (78/100; needs 7). Next: KT-6 Savage Beating (a cast-timing restriction: combat, your turn), then KT-7 the extra-combat forms.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KT-5: CITY OF TRAITORS — landfall learns "played" · **+1** · corpus 14,435 (42.2%) / 34,245
> Suite **1484 files / 16,089 tests** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **7/7 killed.**
> · "When you play another land, sacrifice this land." The landfall family fired on ANY land entering under your control —
>   correct for "a land enters", wrong for "you play a land" (CR 305.1: playing a land is the special action; a land an
>   effect puts onto the battlefield is not played). The play-land dispatcher now threads `played: true` into the landfall
>   check and the effect path does not, so a `playedOnly` descriptor fails CLOSED there (a mutant that defaulted the
>   marker to true died; so did the one that dropped it from the dispatcher). "Another" is a second gate — the watcher never
>   fires on its own entry. Both fields listed in the descriptor assembly (the silent-drop mutants died).
> · **Pins:** a played Mountain sacrifices City; a Mountain put onto the battlefield from the library does not; playing
>   City itself does not.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Killer Turts 76 → 77** (77/100; needs 8). Next: KT-4b Open the Omenpaths (its two-colour mode), then KT-6 Savage Beating.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KT-4a: GEOSURGE — restricted spend on a spell's pips · **+2** · corpus 14,434 (42.1%) / 34,245
> Suite **1483 files / 16,085 tests** green; lint 0. Flip-diff **+2, zero LOST** (any unplanned gains audited whole-card). **6/6 killed.**
> · "Add {R}{R}{R}{R}{R}{R}{R}. Spend this mana only to cast artifact or creature spells." The QUARTET's restricted-spend lane had
>   the ABILITY side (Klauth) and a word-count any-combination spell form (Sarkhan); a pip-pool spell had no arm and — worse —
>   its two sentences split, so the add could have parsed ALONE as unrestricted mana (the laundering FP). The splitter now
>   folds the spend rider onto the pip lead; the atom carries an EXPLICIT pool (a spell has no source permanent to colour
>   from) plus the parsed restriction; the resolver mints the same tagged `restrictedMana` entry the payment planner honours.
> · **Pins:** nothing unrestricted enters the pool; the entry pays a creature spell through the real planner and the real
>   offer, and never an instant; an unvetted rider leaves the clause unparsed. Six mutants — the parse-side and the
>   runtime-side "unrestricted" mutants among them — all died.
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Killer Turts 75 → 76** (76/100; needs 9). Unplanned gain audited: Abstract Paintmage (a first-main-phase trigger whose effect is the same pip-pool restricted add, instant-and-sorcery restriction). Next: KT-4b Open the Omenpaths, then KT-5 City of Traitors.

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KT-3: IRENCRAG FEAT + RITE OF FLAME — the ritual riders · **+3** · corpus 14,432 (42.1%) / 34,245
> Suite **1482 files / 16,083 tests** green; lint 0. Flip-diff **+3, zero LOST** (any unplanned gains audited whole-card). **10/10 killed.**
> · **Irencrag Feat** "Add seven {R}. You can cast only one more spell this turn.": the word-number pip form (the pip form
>   already parsed), and a SELF cast limit — a `castLocksThisTurn[controller].spellLimit` stamp keyed on the controller's
>   spellsCastThisTurn at RESOLUTION (the ritual was counted at its cast, so the next spell is the one more), read by the
>   cast loop, self-expiring with the turn number, the caster only (a mutant that stamped every seat died; a mutant that
>   counted from zero — no spells at all — died). Abilities are never locked (CR 601).
> · **Rite of Flame** "Add {R}{R}, then add {R} for each card named Rite of Flame in each graveyard.": the second half is an
>   add-mana over a new count kind, `cardsNamedInAllGraveyards` — EVERY seat's graveyard (the mutant that read only yours
>   died), read at resolution; the resolving Rite is not yet in the graveyard (CR 608.2m — pinned: 2 with none, 4 with one
>   in yours and one in an opponent's).
> · **CI:** BLOCKED (repo private → billing); LOCAL on the full gates
> · **Killer Turts 73 → 75** (75/100; needs 10). Unplanned gain audited: The Flux (a Saga whose chapter VI is 'Add six {R}' — every other chapter was already native). Next: KT-4 Geosurge + Open the Omenpaths (restricted spend on a spell's add-mana).

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KT-2: GUTTURAL RESPONSE + PYROBLAST — two filters, and the "if it's blue" reading · **+3** · corpus 14,429 (42.1%) / 34,245
> Suite **1481 files / 16,079 tests** green; lint 0. Flip-diff **+3, zero LOST** (Guttural Response, Pyroblast, Hydroblast — audited whole-card). **5/5 killed; the 08 CREED pin on Pyroblast GRADUATED (repointed: native + the colour survives on both modes).**
> · **Guttural Response** "Counter target blue instant spell": the counter atom had a colour filter and a spell-type filter, each
>   alone. The two-filter form now carries both; the enumerator (targeting.js) and the resolver (spellEffects.js) already
>   enforced each independently, so a red instant and a blue creature spell are never targets (pinned; the mutants that
>   dropped either filter were killed).
> · **Pyroblast / Hydroblast** "Counter target spell if it's blue" / "Destroy target permanent if it's blue": CR 608.2b lets
>   the spell target anything and do nothing unless the colour matches. Read as the RESTRICTED twin — Red Elemental Blast's
>   printed wording, already native — inside the modal mode list. An honest UNDER-offer, stated in the code: the sim never
>   aims it at a non-blue object, which is never the winning play; a legal-but-idle cast is unmodelled, never mis-modelled.
> · **CI:** BLOCKED — repo PRIVATE again (billing); KT-1 cf939cef's run died in 2 s with zero steps; pushes HOLD, this slice is LOCAL on the full gates
> · **Killer Turts 71 → 73** (73/100; needs 12). Next: KT-3 Irencrag Feat + Rite of Flame (word-number pips; the self cast limit; the all-graveyards name count).

> ## 🎯 2026-09-05 (cron) — POD-SIM THREE · KT-1: PORT RAZER — the attacked-players memo · **+1** · corpus 14,426 (42.1%) / 34,245
> Suite **1480 files / 16,075 tests** green; lint 0. Flip-diff **+1, zero LOST** (any unplanned gains audited whole-card). **7/7 killed.**
> · **The order this serves:** Colton (mid-cron, 2026-09-05) — Killer Turts → Kinnan → Believe it! to 85, accurate for a pod
>   sim; runbooks on master (POD-SIM-THREE-DECKS.md + three deck files). This is the first slice of that queue.
> · **The card:** Port Razer's trigger line was already native; "This creature can't attack a player it has already attacked
>   this turn" is the extra-combat deck's OWN restriction and was unmodeled — a Razer that attacks the same player in the
>   second combat it just made is exactly the over-attack THE CREED forbids. It is now a defender requirement
>   (`notAlreadyAttacked`) on the existing "can't attack unless defending player …" reader, keyed on a per-permanent memo
>   `attackedPlayersThisTurn` stamped at declare-attacker beside `attackedThisTurn` and cleared with it at untap. The
>   enumeration threads the attacking permanent into the evaluator; without it the check fails CLOSED (an unthreaded caller
>   never over-attacks — the mutant that failed open was killed).
> · **Pins:** first combat both creatures offered and the memo records the defender; second combat the same turn Razer is not
>   offered, the bear is; after the untap reset Razer is offered again and the memo is gone; a bear never carries the memo.
> · **Killer Turts 70 → 71** (71/100; needs 14). Next: KT-2 Guttural Response + Pyroblast (the two-filter counter; the 'if it's blue' mode form mapped to its restricted twin — an honest under-offer).
> · **CI:** GREEN on the runbooks push (run 33931510748); this slice pushes and is watched


---

> **Older entries are archived** (rotated 2026-09-30): [archive/RUN-LEDGER-through-2026-09-04.md](archive/RUN-LEDGER-through-2026-09-04.md).
