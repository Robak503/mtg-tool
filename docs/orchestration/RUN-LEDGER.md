# RUN-LEDGER — live resume anchor for the long build run

> **The live plan is the file the WAKE-REPORT's top block names** — as of 2026-09-29
> [RELEASE-READINESS-PLAN-2026-09-29.md](RELEASE-READINESS-PLAN-2026-09-29.md) (Colton's go), then
> [OVERNIGHT-PLAN-2026-09-06.md](OVERNIGHT-PLAN-2026-09-06.md) stage ③ (② MET 2026-09-30). [NEXT-QUEUE.md](NEXT-QUEUE.md) is spent
> (fallback §B/§D only).
>
> **Release batch (CLAUDE.md §7.2):** unreleased since **v0.160.0** (tagged 2026-08-16): **359 commits**, corpus
> 38.6% → **43.2% (14,784)** — roughly +1,500 cards. A release is owed. Update this line when a slice lands or a tag cuts.
>
> **Read the first ~150 lines** (entries through 2026-09-04 are archived — see the footer). **Repaired 2026-09-30:** commit 26645a2a (2026-08-06)
> had inserted a byte-identical 16,069-line copy of this file's tail mid-line — a scripted `String.replace` whose
> replacement held `grep -v '\.md$'`, where JS expands `$'` to "the rest of the string". The copy is gone and the cut
> line rejoined; the repair was proven on 26645a2a itself (repaired = its parent + one contiguous 9-line insertion,
> the note that was meant). The lesson (gotchas): pass a replacer FUNCTION to `String.replace`, never a string.

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
