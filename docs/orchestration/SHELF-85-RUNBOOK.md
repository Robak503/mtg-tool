# THE SHELF-85 RUNBOOK — every shelf deck to ≥85% native, then the hard wins, then the Omnath list

> **Standing order (Colton, 2026-09-04 06:20Z):** bring EVERY shelf deck — the test shelf, Joe's and Colton's — to at
> least 85% native coverage; after that, sweep for any hard wins still doable and take them; then hand Omnath a final
> list of everything that stays parked. This file is the durable plan: a cron or loop boots from it, picks the next
> item, ships it through the discipline, marks it in place, and stops at a stage boundary. It is written to be
> executed by a chat that has read nothing else.
>
> **Written 2026-09-04 (Cindy).** Measured that night: 30 decks, 14 below 85, 233 card-slots short of the bar
> in total. Live percentages beat the numbers here — re-measure in §0 before trusting a row.

---

## 0. BOOT RITUAL (a fresh chat starts here; under two minutes)

1. Read this file top to bottom once. Then read the top block of [WAKE-REPORT.md](WAKE-REPORT.md) for the live state.
2. Every engine command runs from `app/` with `MTG_APP_ROOT="C:\Users\colto\AppData\Roaming\com.colton.mtg-tool"`
   (in bash: `MTG_APP_ROOT="C:/Users/colto/AppData/Roaming/com.colton.mtg-tool"`).
3. Re-measure the shelf: `node scripts/measure-coverage.mjs` (whole shelf) — paste the PER-DECK table into §1's
   live table if any number moved. Per deck: `node scripts/measure-coverage.mjs "<deck substring>"`.
4. Take the session's corpus baseline BEFORE the first edit:
   `node scripts/tier-snapshot.mjs --out=<scratch>/before.json`.
5. Find the next item with the §2 selection rule. If a row is marked 🔄 (in flight), CONTINUE it — never restart.
6. Ship it through §3 (the discipline), mark the row, update §1's table, push, confirm CI green, take the next row.
7. Stop only at a stage boundary (§4 lists them) — update the wake report there. If nothing is actionable, write
   that in one line in the wake report and stop.

**The four instruments** (all in `app/scripts/`, all read the same `classifyCard` the metric uses, so they cannot
disagree about "native"):

| Instrument | Question it answers | Command |
|---|---|---|
| `measure-coverage.mjs [deck]` | how far is a deck from the bar; the mechanism histogram | `node scripts/measure-coverage.mjs "Teval"` |
| `deck-gap.mjs <deck>` | WHICH cards in a deck are not native, with tier and bucket | `node scripts/deck-gap.mjs "Teval"` |
| `shelf-gap-ledger.mjs --md` | the sized per-deck, per-card list: ONE-CARD vs COMPOSITE vs shared | `node scripts/shelf-gap-ledger.mjs --md > ledger.md` |
| `probe-shelf-one-line-away.mjs --limit=200` | shelf cards exactly one oracle line from native, ranked by decks touched | `node scripts/probe-shelf-one-line-away.mjs --limit=200` |
| `tier-snapshot.mjs --out / --diff` | the flip-diff (GAINED / LOST / RETIERED) — the zero-LOST gate | `node scripts/tier-snapshot.mjs --diff=before.json,after.json` |

---

## 1. DEFINITION OF DONE + THE LIVE TABLE

**Done** = every deck in the table below reads ≥85% on `measure-coverage`, OR carries a written **CEILING** call
in its §5 section (what is left, why it is unbuildable-class under the CREED, and the date Omnath was told).
After that, Phase 3 (§4) sweeps the remaining hard wins, and Phase 4 compiles the Omnath list.

**The bar is per deck, not aggregate.** A slot is "native" only when the runtime actually plays the card
(the CREED — false-negative safe, false-positive forbidden). Nothing is credited that the engine cannot play.

### 1.1 Live table (update in place after every slice; measured 2026-09-04 06:15Z)

| Shelf | Deck | Native | Needs to 85 | Needs to 90 | Status |
|---|---|---|---|---|---|
| Colton | Omnath, Locus of Mana | 94 | — | — | ✅ at the bar |
| Colton | Vihaan, Goldwaker | 95 | — | — | ✅ at the bar |
| Colton | Zaxara kinda X'ish | 94 | — | — | ✅ at the bar |
| Colton | Veyran Cantrips | 91 | — | — | ✅ at the bar (④-BD) |
| Colton | The Unbeatable Squirrel Girl | 90 | — | — | ✅ at the bar |
| Colton | cdh | 88 | 0 | 2 | ✅ at 85 · Phase 3 candidate |
| Colton | Killer Turts | 85 | 0 | 5 | ✅ at 85 · Phase 3 candidate |
| Joe | Did you say Dragons? | 91 | — | — | ✅ at the bar |
| Joe | Earth Bent | 91 | — | — | ✅ at the bar (④-BE) |
| Joe | Mothman Cometh | 90 | — | — | ✅ at the bar |
| Joe | Captain America Shoot your Shot | 87 | 0 | 3 | ✅ at 85 · Phase 3 candidate |
| Joe | Hulk Smash | 87 | 0 | 3 | ✅ at 85 · Phase 3 candidate |
| Joe | Wolverine, claws out! | 88 | 0 | 2 | ✅ at 85 · Phase 3 candidate |
| Joe | Jurassic Ramp | 86 | 0 | 4 | ✅ at 85 · Phase 3 candidate |
| Joe | Kinnan Mana Overload | 85 | 0 | 5 | ✅ at 85 · Phase 3 candidate |
| Joe | Believe it! | 85 | 0 | 5 | ✅ at 85 · Phase 3 candidate |
| Joe | Kellan of the west | 85 | 0 | 5 | ✅ at 85 · Phase 3 candidate |
| Joe | Halfshell heroes | 83 | 2 | 7 | ⬜ Phase 2 |
| Test | Slivers | 99 | — | — | ✅ at the bar |
| Test | Thrun Voltron | 91 | — | — | ✅ at the bar |
| Test | Test Rashmi | 91 | — | — | ✅ at the bar |
| Test | Teval, the Balanced Scale Test | 86 | 0 | 4 | ✅ at 85 · Phase 3 candidate |
| Test | Brago Blink | 85 | 0 | 5 | ✅ at 85 · Phase 3 candidate |
| Test | Nekusar Wheels | 87 | 0 | 3 | ✅ at 85 · Phase 3 candidate |
| Test | Shorikai Vehicles | 86 | 0 | 4 | ✅ at 85 · Phase 3 candidate |
| Test | Shalai and Hallar Test | 85 | 0 | 5 | ✅ at 85 · Phase 3 candidate |
| Test | Otharri Test | 86 | 0 | 4 | ✅ at 85 · Phase 3 candidate |
| Test | Bumble Flower Combo | 88 | 0 | 2 | ✅ at 85 · Phase 3 candidate |
| Test | Atraxa Superfriends | 74 | 11 | 16 | ⬜ Phase 2 |
| Test | Light-Paws Voltron | 81 | 4 | 9 | ⬜ Phase 2 |

**3 decks below 85 · 17 slots short.** Cross-deck sharing (§4 Phase 1) pays several slots per build; the honest
expectation is 8–12 sessions of slices for Phase 2 on top of Phase 1, with the two cEDH decks and Light-Paws carrying the
most unbuildable-class residue (§5 marks it).

### 1.2 Standing exclusions (never build these; they go straight to the Omnath list)

- **Theft is never trained** (Colton, 2026-08-15): any card that takes or exchanges control stays parked ON PURPOSE —
  Gilded Drake (Kinnan), Eriette's Tempting Apple (Bumble Flower), Commandeer (Believe it!), Kellogg. Mark ⛔ THEFT.
- **cEDH decks grind LAST** (Colton, 2026-08-15): Believe it! and Kinnan are the final two Phase 2 decks. Their §5
  sections are sized so the order is honest, not so they are skipped.
- **Pre-game and hidden-information effects** (Gemstone Caverns' opening-hand clause, Doomsday's pile, Tainted Pact /
  Demonic Consultation's reveal-until, Lim-Dûl's Vault) — no pregame seam exists; mark 🅿 CEILING unless a seam is built
  deliberately as its own subsystem (not inside this runbook).
- **A card the CREED cannot express** (Scythecat Cub's "second time this ability has resolved this turn" is the
  reference — parked by design in `effectAtoms.js`) — mark 🅿 CREED unless the missing predicate is built honestly and
  end-to-end (a per-source per-turn resolution counter is expressible; see §5 Shalai).

---

## 2. THE SELECTION RULE (what a wake-up does)

1. If any row anywhere in §4 or §5 is marked **🔄** — that slice is mid-flight: continue it, never restart or re-probe.
2. Otherwise take the FIRST row marked **⬜** in this order:
   1. **Phase 1 — cross-deck veins** (§4.1), top to bottom. A vein pays in ≥2 decks; build the SHARED machinery once.
   2. **Phase 2 — deck by deck, closest to the bar first** (§5 order: Teval → Brago → Nekusar → Shorikai → Kellan →
      Shalai → Otharri → Bumble Flower → Atraxa → Halfshell → Killer Turts → Light-Paws → Kinnan → Believe it!).
      **OVERRIDE (Colton, 2026-09-05, for a pod sim): Killer Turts → Kinnan → Believe it! are the NEXT THREE to 85, ahead of
      everything else; Shalai (84, needs 1) waits behind them. Then the order above resumes.**
      Their in-depth runbooks: [POD-SIM-THREE-DECKS.md](POD-SIM-THREE-DECKS.md) (umbrella: capability map, shared seams, order)
      · [RUNBOOK-KILLER-TURTS.md](RUNBOOK-KILLER-TURTS.md) · [RUNBOOK-KINNAN.md](RUNBOOK-KINNAN.md) · [RUNBOOK-BELIEVE-IT.md](RUNBOOK-BELIEVE-IT.md).
      After the three: every card still on the Arbiter in those lists → Omnath's arbiter play-nuance list (Colton 09-05).
      Inside a deck: every **S** row, then **M** rows, then **L** rows; stop the deck the moment `measure-coverage`
      reads ≥85 and move to the next deck (the remaining rows stay ⬜ for Phase 3).
   3. **Phase 3 — hard wins** (§4.3): only after every deck reads ≥85 or carries a CEILING.
   4. **Phase 4 — the Omnath list** (§4.4): only after Phase 3.
3. A row's blocker text (from the ledger) IS the probe of record — do not re-probe it; probe only the machinery you
   intend to touch (the arm, the resolver, the runtime lane) before writing code.
4. Sizes are estimates by shape: **S** one arm on existing machinery (≤1 hour) · **M** a new atom / event / seam
   (1–3 hours) · **L** a subsystem (multi-session; ship in slices) · **🅿** park with reason · **⛔** excluded.
   If a row turns out a size larger than marked, note it in the row and keep going only if it still fits the session;
   otherwise mark it and take the next row.
5. Markers: ⬜ open · 🔄 in flight (write the slice id and the date beside it) · ✅ shipped (+N slots, commit hash) ·
   🅿 parked (reason, COMMS date) · ⛔ excluded (rule).

---

## 3. THE PER-SLICE DISCIPLINE (never skip a step — the OVERNIGHT-PLAN §5 law, condensed)

1. **Probe** the machinery you will touch — read the real oracle through `probe` scripts (never memory), the arm, the
   resolver, the runtime lane (legalChoices / the flush). The blocker line in §5 is already the classifier probe.
2. **Smallest honest arm.** The RUNTIME half before the classifier half: the engine must PLAY the card before the
   metric credits it. A classifier-only flip is a hollow credit (the forbidden direction).
3. **Flip-diff by tier snapshot** — `tier-snapshot.mjs --out` then `--diff=before,after`. **Zero LOST.** Every GAINED
   card is audited whole-card (print its oracle; every line must be honest, not just the line you built — ④-AU found a
   five-card over-fire this way, ④-AW a wrong-source read).
4. **Witness file** — a `*.test.js` beside the engine with: the parse pin, the tier pins (real oracle fixtures), and a
   RUNTIME pin that plays the card on a board (the taken and the declined path for optionals; the expiry for
   durations; the opponent's seat for "each"/"defending player").
5. **Mutations SEEN to fail** — a scratch `mutate-<slice>.py` that applies each mutation (`false &&` the arm, drop the
   stamp, widen the scope, swap the seat), runs the witness, prints KILLED / SURVIVED / LOAD-ERROR, and RESTORES the
   file. "No test files found" = load error = redo. A SURVIVED mutation is documented, deleted, or gets the missing
   test — never ignored (④-BE deleted an unobservable guard this way).
6. **Lint + FULL suite**, exit codes unpiped, chained with `;`:
   `npx eslint <files>; echo "lint $?"; npm test > <scratch>/suite.log 2>&1; echo "suite exit $?"`.
   Old CREED pins that flip are GRADUATED with the date and a comment (three did on ④-BD).
7. **Docs**: RUN-LEDGER entry (newest first) · CHANGELOG line · this file's row + §1 table · WAKE-REPORT top block.
   Stamp the real date. A park also gets a terse COMMS line in the vault (`memory/COMMS.md`, anchored on the exact
   `## LOG (newest first)` line) and a `sync-brain.cjs` run.
8. **Measure the deck(s)** touched; paste the new % into §1.
9. **Commit** with explicit paths (never `git add -A`), Conventional Commits, the co-author trailer.
10. **Push to master**, then **confirm CI green** (`gh run list --branch master`; `gh run watch <id> --exit-status`)
    BEFORE the next push. A shard-2 timeout on a sim-heavy test is runner variance: re-run the failed jobs
    (`gh run rerun <id> --failed`), and widen that test's timeout to 90 s in a `test(ci)` commit (the wall is a hang
    detector, not a speed budget — the abBench / self-play P5 / crucibleRun precedent).

**Nine traps (law):** no regex escapes through scripted rewrites (use the Edit tool; a heredoc collapses backslashes) ·
encode-before-write / temp-then-rename · never write under `app/src` while a vitest suite runs · one gate run at a
time · a surviving mutation is never ignored · deck writes only via the app API · stamp the real date · never `git
stash` (the stack is shared) · the Write tool overwrites silently — glob the name first.

---

## 4. THE PHASES

### 4.1 Phase 1 — cross-deck veins (build the shared machinery once; each pays in ≥2 decks)

Ordered by slots paid across the 14 sub-85 decks, then by size. Every row: ⬜ open until shipped.

| # | Vein | Decks (sub-85) | Slots | Size | What to build | Status |
|---|---|---|---|---|---|---|
| V1 | **Modal double-faced cards (spell // land, land // land)** — Sink into Stupor, Witch Enchanter, Sundering Eruption, Shatterskull Smashing, Hydroelectric Specimen, Fell the Profane, Bridgeworks Battle, Boggart Trawler, Agadeem's Awakening, Sea Gate Restoration, Sejiri Shelter, Revitalizing Repast, Glasspool Mimic, Emeritus of Truce, Wandering Archaic; the five Pathways (Barkchannel, Hengegate, Branchloft, Needleverge, Blightstep) | Teval 6 · Believe 6 · Kellan 5 · Shalai 5 · Otharri 5 · Kinnan 4 · Shorikai 3 · Nekusar 3 · Brago 2 · Bumble/Halfshell/Turts/Light-Paws 1 each (+~15 more in the 85–89 decks) | **~43** | **L** (ship in slices) | PROBE FIRST: today these classify `land-partial` — the land drop plays the back face, so what is missing is (a) the classifier reading a `//` oracle as two faces, (b) the cast lane offering the FRONT face as a spell when its program parses HIGH, (c) the play-land lane offering the back face with its enter clause (pay 3 life or tapped). Slice 1 = the five Pathways (both faces plain lands; the face choice on the land drop; +7). Slice 2 = spell//land where the front is already a modeled spell (Sink into Stupor's bounce, Fell the Profane's destroy, Shatterskull's X damage…). Slice 3 = the rest. | 🔄 slice 1 ✅ (+10 corpus — the ten Pathways; the face-choice land drop is live: legalChoices.actionsPlayLand per-face actions, applyPlayLand enters the face with the combined card as printedCard, classifyCard credits a Land // Land iff both faces are covered; the Ixalan transform//land cards left the land bucket). Slice 2 ✅ (+19 corpus — the 19 spell//lands whose instant/sorcery front is native on its own view: cast as a face through the split-card lane, the back drops as a land; the 16 with unmodeled fronts (Sink into Stupor's spell-or-nonland-permanent target, Agadeem's Awakening, Sea Gate Restoration, Shatterskull Smashing …) stay land-partial and are their OWN rows now). Slice 3 ✅ (+9 — the nine permanent fronts: Witch Enchanter, Glasspool Mimic, Kazandu Mammoth, Skyclave Cleric, Pinnacle Monk, Blackbloom Rogue, Glasswing Grace, Tangled Florahedron, Akoum Warrior; the real card rides as printedCard on entry). **V1 DONE (+38 corpus)** — the 22 modal DFCs still land-partial park on their FRONT's own residue and are ordinary rows now (Sink into Stupor's spell-or-nonland-permanent union ×3 decks; Agadeem's Awakening / Sea Gate Restoration / Shatterskull Smashing / Hydroelectric Specimen / Boggart Trawler …); the Ixalan transform//lands and the Kaldheim gods are NOT modal and stay where they are. |
| V2 | **Starting Town** — "enters tapped unless it's your first, second, or third turn of the game" + "{T}, Pay 1 life: Add one mana of any color" | Teval · Kellan · Shalai · Otharri | 4 | **S** | the enters-tapped-unless condition reads the controller's own turn ordinal (a per-player turn counter; if none exists, stamp `turnsTakenThisGame` at the untap step); the pay-life any-colour tap is the payLife mana spec (exists). | ✅ (+1 corpus — `player.turnsTaken` stamped at the untap step; the vocabulary reads the ordinal; the pay-life any-colour line is an honest EXTRA record carrying `payLife` and gated on life, and the whole-card merge no longer offers a free any-colour main beside it — that FP existed the moment the line became an extra and the witness caught it). |
| V3 | **Minamo, School at Water's Edge** — "{U}, {T}: Untap target legendary permanent" | Kinnan · Shorikai (+cdh) | 2 (+1) | **S** | the untap atom + a `legendary` restriction on targetType permanent (matchesSelector already knows `legendary`; enumerateTargets' permanent pool needs the kind) | ✅ (+2 corpus — the word `legendary` on the untap-target arm emitting the existing `supertype` restriction; the permanent and creature pools already ran it. Unplanned twin: Patriar's Seal "untap target legendary creature you control", audited whole-card.) |
| V4 | **Orcish Bowmasters** — ETB and "whenever an opponent draws a card except the first one they draw in each of their draw steps": 1 damage to any target, then amass Orcs 1 | Nekusar · Believe | 2 | **M** | an opponent-draw watcher with the first-draw-of-the-draw-step exception (the `drawnThisTurnIds` / draw-step ledger exists: stamp which draws are the turn's own); amass exists; "any target" chooser on a trigger = enemy intent | ✅ (+3 corpus — a flagged opponentDraw arm; gameEngine's draw step stamps its draw `drawStepFirst` and checkCardDrawnTriggers skips the flagged descriptor on that one draw. **A live FP closed on the way:** the compound "When A and whenever B, E. Then R." split dropped R from the FIRST half — Flaring Cinder and Giott discarded on ETB with the "If you do, draw" payoff gone; both halves now carry the then/if tail. Leela, Sevateem Warrior rides the arm.) |
| V5 | **Proft's Eidetic Memory** — beginning of combat, if you've drawn more than one card this turn, put X +1/+1 counters (X = cards drawn − 1) | Brago · Nekusar | 2 | **M** | combat-start trigger + intervening-if on `cardsDrawnThisTurn > 1` + countFor kind `cardsDrawnThisTurnMinusOne` | ✅ (+2 corpus — the intervening-if "you've drawn more than one card this turn" and the count source "cards you've drawn this turn [minus one]" (kind `cardsDrawnThisTurn`, `minus` floored at 0), both off `player.cardsDrawnThisTurn`. Unplanned twin: Thundering Djinn's attack damage counts the same tally, audited whole-card.) |
| V6 | **Peter Parker's Camera / Strionic Resonator / Kirol** — "copy target activated or triggered ability you control" | Brago (×2: Camera + Resonator) · Killer Turts · Otharri (Kirol) | 4 | **M** | CAP-BRACERS built `copy-activated-ability` on an event; this is a CHOSEN stack-object target of kind ability (enumerateTargets: the stack's non-spell objects you control) + the same copy resolver; Camera's film counter cost = removeCounter (exists) | ✅ slice 1 (+3 corpus — Camera + Resonator + the unplanned Adric: the `copy-ability` atom on a CHOSEN stack target (`abilityYouControl`, printed kinds threaded on the target spec), the own-controller pool on the Stifle-class target shape, a target-keyed copy resolver, and THE STACK WINDOW — the priority holder may activate a stack-ability copier at any step while the stack holds an ability they control. Slice 2 = Kirol: the "Tap two untapped creatures you control:" cost lane (parseAbilityCost reads one creature only).) **Slice 2 ✅ (+12 — Kirol and ELEVEN twins on the counted "Tap N untapped creatures you control" cost: parseAbilityCost reads the count, legalChoices freezes N untapped creatures (sick bodies first, the {T} source excluded) onto `tapCountIds`, the dispatcher taps the set and neither site lets it pay mana; the AI never auto-spends it. Twins: Sandsower, Nullmage Shepherd, Larder Zombie, Diversionary Tactics, Skaab Wrangler, Root-Kin Ally, Prosperous Partnership, Siege Zombie, Skirsdag High Priest, Tradewind Rider, Grove of the Guardian — every effect already modeled.) V6 DONE (+15).** |
| V7 | **Rosie Cotton of South Lane** — "whenever you create a token, put a +1/+1 counter on target creature you control other than Rosie" | Otharri · Bumble | 2 | **S/M** | the token-created event (Staff of the Storyteller / Splinter want it too — "whenever you create one or more tokens"); "target creature you control other than this creature" = creatureYouControl + excludeSource (the ④-AF `notSource` restriction on the peel) | ✅ (+1 corpus — the token-created event and the Food token existed; two cells were missing: the "<Name> of <Place>" self-name candidate on detectTriggers' anchored rewrites plus a whole-clause arm for the trailing "other than <Name>" exclusion, and the counter parser's "target creature you control other than this creature" form = the excludeSource atom. Rosie is never a legal target of her own gift.) |
| V8 | **Arcade Cabinet** — "double the number of each kind of counter on target creature" | Bumble · Halfshell | 2 | **S** | the Voracious Hydra doubler exists for +1/+1; generalize to every kind in the bag (`countersOnSource` all-kinds precedent) | ✅ (+5 corpus — two cells: the "Sacrifice a token" cost (sacOther type `token`, matched on the victim's token flag) and a `double-all-counters` atom on a chosen creature target (every kind on it, each through addCounter so Doubling Season composes). The ETB's up-to-four counter pick already parsed.) |
| V9 | **Valley Floodcaller** — cast noncreature → "Birds, Frogs, Otters, and Rats you control get +1/+1 until end of turn. Untap them." | Kinnan (+cdh) | 1 (+1) | **S** | a four-subtype team pump (the dynamic selector takes a subtypes ARRAY) + untap the same set | ✅ (+1 corpus — a multi-subtype team-pump arm (a comma/and list of curated subtypes → `subtypeFilter` array; Frog and Otter joined the vocabulary) and the trailing "Untap them." folded onto the pump the way "Untap it." already was (`untap: true` — applyPumpEffect untaps each pumped creature). The flash-permission static and the noncreature cast watcher existed.) |
| V10 | **Scythecat Cub** — landfall counter; "if this is the second time this ability has resolved this turn, double instead" | Shalai (+Earth Bent already at 90) | 1 | **M** | expressible after all: stamp `abilityResolutionsThisTurn[sourceId][abilityKey]` at trigger resolution, expose `thisAbilityResolvedNthTimeThisTurn` to evaluateInterveningIf, and lift the deliberate park in `effectAtoms.js` (repin its CREED test) | ✅ (+5 corpus — a per-turn ledger of each triggered ability's resolutions (`abilityResolutionsThisTurn`, keyed source:ability, bumped when the ability's stack object resolves), the intervening-if word "this is the second time this ability has resolved this turn" (reads the ledger through ctx.abilityKey — no key → false, FN-safe), the "double the number of +1/+1 counters on that creature" alternative bound to the base's chosen target, and a TARGETED conditional (the branch node carries the base's targetType so the trigger chooses one creature both branches see).) |
| V11 | **Path of Ancestry** — commander-identity any-colour mana + "when that mana is spent to cast a creature spell that shares a type with your commander, scry 1" | Halfshell (+Mothman, Jurassic) | 1 (+2) | **M** | the mana half = colours from the commander's identity (the Cavern lane's chosen-type restriction is the sibling); the spent-rider needs the `uncounterableIfSpent`-style stamp on the cast site turned into a scry trigger — build whole or not at all (CREED) | ✅ (+1 corpus — built whole: `parseManaSpentRider` stamps the rider on the source, the planner's projection and tap carry it (an unlisted field there is a dropped field — the first draft lost it at the projection), the cast site reads it off the same plan the commit deducted and enqueues the land's scry for a creature spell sharing a printed creature type with a commander (command zone or battlefield; a Kindred instant never), flushed above the spell; detectTriggers recognises the sentence FIRST so coverage reconciles. **Parked beside it:** the identity mana line itself still yields any colour (Command Tower too — pre-existing).) |
| V12 | **The extra-turn trio** — Final Fortune, Last Chance, Warrior's Oath: "Take an extra turn after this one. At the beginning of that turn's end step, you lose the game." | Killer Turts | 3 | **M** | extra turns exist (probe `extraTurns`); the delayed lose-the-game must fire on THAT turn's end step only (a `fireScope: "thatTurn"` on the delayed queue keyed to the extra turn's number) | ✅ (+4 corpus — the delayed timing "that turn's end step" → fireScope `thatTurn`; advanceStep stamps `extraTurnOf` when it pops an extra turn and clears it on a normal rotation; the drain fires a thatTurn record only at the end step of the controller's extra turn (never the casting turn's own end step); "you lose the game" is the win-game atom on the controller. The AI never casts a spell carrying a delayed loss.) |
| V13 | **Maze of Ith** — "{T}: Untap target attacking creature. Prevent all combat damage that would be dealt to and dealt by that creature this turn." | Atraxa (×2 slots) | 2 | **M** | untap in the combat window (④-AE) + a per-creature "prevent all combat damage to and by" flag for the turn (the `noCombatDamageTurn` stamp from ④-AU is the dealer half; add the receiver half) | ✅ (+3 corpus — the prevent sentence folds onto the untap (as "Untap it." folds onto a pump); the untap resolver stamps BOTH halves on the target for the turn (`noCombatDamageTurn` — the ④-AU dealer gate — and the new `takesNoCombatDamageTurn`); combat resolution prevents damage TO a stamped creature at both receiver sites exactly like protection (assignment still absorbs lethal, so a trampler spills only the excess). Offered in the combat window (④-AE); the AI aims it at an attacker attacking it (enemy-facing), never its own.) |
| V14 | **Gingerbrute / Tough Cookie** | Bumble (×2 each) | 4 | S / M | Gingerbrute: "can't be blocked this turn except by creatures with haste" = the except-by keyword filter with `Haste` added to the allowlist (S). Tough Cookie: "target noncreature artifact you control becomes a 4/4 artifact creature until end of turn" = the animate lane on a chosen artifact (M) | ✅ (+4 corpus — Gingerbrute: the self "can't be blocked this turn except by creatures with <keyword>" effect as a `cantBeBlockedExceptBy:<Keyword>` grant read by grantedAttackerExceptions into the printed static's own keyword arm (a haste blocker may still block). Tough Cookie: the animate lane on a CHOSEN noncreature artifact you control (the layer-aware predicate + the controller restriction; the man-land resolver). Twins: Resilient Roadrunner, Alloy Animist.) |
| V15 | **Chains of Custody / Sheltered by Ghosts / Detainment Spell** (Light-Paws ×2 each) | Light-Paws | 6 | M | Aura ETB "exile target nonland permanent an opponent controls until this Aura leaves" = the detain-exile lane with an AURA source (exists for creatures/enchantments; probe the aura path); Detainment Spell's "{1}{W}: attach this Aura to target creature" = a re-attach activated ability (the equip lane's aura twin) | ✅ (+10 corpus — the detain frame learned the AURA noun ("until this Aura leaves the battlefield"); the ward {2} / lifelink grants were already read by the attached-clause grammar and are live in layers; Detainment Spell's "{1}{W}: Attach this Aura to target creature" rides the equip lane as an Aura re-attach (any creature, an opponent's included; the resolver waives Equip's own-creature rule for it) and the aura-own-activated validator admits it. **Phase 1's vein rows are complete.**) |

### 4.2 Phase 2 — deck by deck (§5 has every row)

Order and the honest per-deck expectation after Phase 1's veins land (slots from veins in brackets):

1. **Teval 75** — needs 10 [V1 ≈6, V2 1] → then 3 one-card rows (Field of the Dead, Titania, Thespian's Stage).
2. **Brago 74** — needs 11 [V1 2, V5 1, V6 2] → 6 one-card rows (Reflector Mage, Recruiter, Teleportation Circle, Unquestioned Authority, Loran, Riptide Gearhulk).
3. **Nekusar 71** — needs 14 [V1 3, V4 1, V5 1] → 9 (Bedevil, Bojuka Bog, Sheoldred, Forced Fruition, Painful Quandary, Phyrexian Tyranny, Dark Deal, Wheel and Deal, Peer into the Abyss).
4. **Shorikai 70** — needs 15 [V1 3, V3 1] → 11 (the Vehicle vein: Thunderhawk Gunship, Parhelion II, Prodigy's Prototype, Peacewalker Colossus, Mobilizer Mech, Shorikai itself, Sai, Surgehacker Mech, Permission Denied, Emry, The Indomitable).
5. **Kellan 70** — needs 15 [V1 5, V2 1] → 9 (Rashmi, Mind's Dilation, Transcendent Dragon, Monk Gyatso, Make Your Own Luck, Unexpected Results, Planar Nexus, Eladamri, The Key to the Vault) — the top-of-library-play subsystem (Future Sight class) is the wall here; call the ceiling honestly.
6. **Shalai 69** — needs 16 [V1 5, V2 1, V10 1] → 9 (Krenko, Yoshimaru, Spider-Man, Arwen, Damning Verdict, Hajar, Boromir, Kutzil, Skrelv).
7. **Otharri 68** — needs 17 [V1 5, V2 1, V6 1, V7 1] → 9 (Anim Pakal, Glimmer Lens, Minas Tirith, Tithe, Blacksmith's Skill, Zack Fair, Staff of the Storyteller, Inti, Diamond City).
8. **Bumble Flower 64** — needs 21 [V1 1, V7 1, V8 1, V14 4] → 14 (Ms. Bumbleflower, Academy Manufactor, Study the Classics, Treebeard, Wave Goodbye, Secret Rendezvous, Riot Control, Heaped Harvest, Elanor Gardner, Kwain, Lembas, Sam, Samwise ×2, Hot Soup…).
9. **Atraxa 64** — needs 21 [V13 2] → 19 — the planeswalker deck: loyalty abilities are modeled per card; every "COMPOSITE" planeswalker is its own two-to-three-line build. Expect a CEILING above ~80 unless the loyalty-ability parser gets a general pass (an L in its own right — size it as one slice: "the loyalty vocabulary sweep").
10. **Halfshell 64** — needs 21 [V1 1, V8 1, V11 1] → 18 (the counters-matter vein: Casey Jones, Ray Fillet, Baxter, Together Forever, Tokka & Rahzar, Coin of Mastery, Heroes in a Half Shell, Big Apple, Big Mother Mouser, Shellshock, Swift Demise, Wave Goodbye, Continue?, Exploding Barrel, Everything Pizza, Endless Foot Assault, Splinter, Foot Chopper).
11. **Killer Turts 64** — needs 21 [V1 1, V6 1, V12 3] → 16 (Rite of Flame, Irencrag Feat, Geosurge — restricted-spend mana (the QUARTET restricted-spend lane); Pyroblast/Guttural Response/Avoid Fate — filtered counters; Shinka; Scroll Rack; Port Razer; Last Night Together; Savage Beating; City of Traitors; Tibalt's Trickery; Carpet of Flowers).
12. **Light-Paws 61** — needs 24 [V1 1, V15 6] → 17 — the Aura deck: Light-Paws' own tutor-on-aura-cast, Face of Divinity, Solid Footing, Gauntlets of Light (toughness-assigns), Greater Auramancy, Umbra Mystic, Shielded by Faith, Brilliant Wings, Mantle of the Ancients, Sentinel's Mark, Shardmage's Rescue, Celestial Mantle, With Great Power, Winds of Rath, Karametra's Blessing, Deafening Silence, Drannith Magistrate, Enter the Avatar State.
13. **Kinnan 72 (cEDH, LAST)** — needs 13 [V1 4, V3 1, V9 1] → 7 — after the theft and pregame exclusions (Gilded Drake ⛔, Gemstone Caverns 🅿) the honest rows are Thassa's Oracle, Transmute Artifact, Moonsilver Key, Treasure Vault, Cephalid Coliseum, The Mycosynth Gardens, Copy Enchantment / Clever Impersonator (clone lane).
14. **Believe it! 71 (cEDH, LAST)** — needs 14 [V1 6, V4 1] → 7 — after the exclusions (Commandeer ⛔, Gemstone Caverns / Doomsday / Tainted Pact / Demonic Consultation / Lim-Dûl's Vault 🅿) the honest rows are Thassa's Oracle, Thousand-Faced Shadow, Moon-Circuit Hacker, Shizo, Ingenious Prodigy, Nanogene Conversion, Roaming Throne, Satoru. Expect a CEILING near 85.

### 4.3 Phase 3 — the hard-wins sweep (only after Phase 2)

1. Re-run all four instruments; refresh §1 and the §5 rows (numbers move as veins land).
2. Take every deck sitting 85–89 to 90 where ≤3 rows away: **Mothman 88 (2)**, Cap 86 (4), Hulk 86 (4), and the 85s
   (Rashmi, Wolverine, Jurassic, cdh — 5 each). Their rows are in the ledger (`shelf-gap-ledger.mjs --md`); the cheap
   ones by shape: Mothman — Nesting Grounds (move a counter: the ozolith move atom), Path of Ancestry (V11), The Master
   (graveyard-milled-this-turn filter); Cap — Iron Man (attack trigger + sacrifice-a-noncreature-artifact rider),
   Uthros (station ×2 — a subsystem); Hulk — Arena ×2 (fight-ish with an opponent's choice), Desert, Xenagos; Jurassic —
   Ravenous Tyrannosaurus (④-AW's source-power damage + "up to one other" + excess-damage rider), Wrathful Raptors,
   Descendants' Path, Secluded Courtyard (Cavern's activated-ability tail), Agonasaur Rex (cycling trigger).
3. Re-run `probe-shelf-one-line-away.mjs --limit=200`: any row touching ≥2 decks that is S or M is a hard win — take it.
4. Any Phase 2 row left ⬜ in a deck that already crossed 85 and is S — take it (it moves the deck toward 90).
5. Stop Phase 3 when no S/M row touches ≥2 decks and every 85–89 deck is either at 90 or has only L/🅿 rows left.

### 4.4 Phase 4 — the Omnath hand-off list

1. Compile every 🅿 and ⛔ row from §4 and §5 into ONE list grouped by deck, each with the blocker line and the reason
   (CREED / THEFT / PREGAME / SUBSYSTEM-L / CEILING).
2. Post it as one COMMS entry (`memory/COMMS.md`, anchored on `## LOG (newest first)`), tagged `[Q-SHELF-85-OMNATH]`,
   and run `node C:/Projects/omnath-vault/omnath-tools/sync-brain.cjs`.
3. Omnath owns the Arbiter play-nuance backfill for those cards (the `note` field on `parked:true` entries in
   `card-play-hints.json`); Cindy's lane is done when the list is posted and the wake report carries the final table.
4. Final wake-report block: the §1 table at its end state, the ceilings called, the slice count, the corpus number.

---

## 5. PER-DECK RESIDUE (the ledger of 2026-09-04, sized; the blocker text is the probe of record)

Legend: **S** small · **M** medium · **L** subsystem · **🅿** park (reason) · **⛔** excluded (rule) · **V#** paid by a
Phase 1 vein · COMPOSITE rows list the card only — size on approach with `deck-gap.mjs` + the oracle probe.

### 5.1 Teval, the Balanced Scale Test — 75% · needs 10 · lands deck (15 land-partial slots)

| Row | Card | Blocker (ledger) | Size | Note | Status |
|---|---|---|---|---|---|
| T1 | Sink into Stupor · Fell the Profane · Bridgeworks Battle · Boggart Trawler · Agadeem's Awakening · Multiversal Passage | MDFC | V1 | six slots from the vein | ✅ V1 shipped Fell the Profane + Bridgeworks Battle (the land backs of all five MDFCs play); the four left park on their FRONTS and are the rows below |
| T1a | Sink into Stupor | "return target spell or nonland permanent an opponent controls to its owner's hand" — the spell∪nonland-permanent target union on the bounce atom | M | the Venser spellOrPermanent union exists for the bounce; this one is spell ∪ NONLAND permanent an opponent controls | ⬜ |
| T1b | Agadeem's Awakening | "any number of target creature cards that each have a different mana value X or less" from your graveyard | L | any-number reanimate with a pairwise distinct-MV constraint (the sharesCreatureType subset precedent, inverted) | ⬜ |
| T1c | Boggart Trawler | ETB "exile target player's graveyard" | S | a player-target graveyard exile (Relic of Progenitus' target-player pick, whole graveyard) | ✅ (+5 corpus — the ETB already parsed to the exile-graveyard atom; its chosen-player target had NO side intent ("ambiguous"), so every trigger carrying it routed to the Arbiter. Intent = enemy: the flush chooser aims it at an opponent's graveyard. Bojuka Bog and the other exile-target-player's-graveyard triggers came with it.) |
| T1d | Multiversal Passage | "As this land enters, choose a basic land type. Then you may pay 2 life. If you don't, it enters tapped. / This land is the chosen type." | M | the chosen-basic-type land (a Cavern-style chooser stamping a subtype; the mana model reads the chosen type) + the pay-2-life shock rider | ⬜ |
| T2 | Starting Town | enters tapped unless turn 1–3 | V2 | |✅ |
| T3 | Field of the Dead | "whenever this land or another land you control enters, if you control seven or more lands with different names, create a 2/2 Zombie" | M | landfall (self-or-another land) + a distinct-land-names intervening-if + token | ✅ (+1 corpus — the trigger already detected as a land-ETB watcher the play-land path fires, and the Zombie token parsed; the one cell was the intervening-if word "you control N or more lands with different names" — the controller's lands counted by DISTINCT name, layer-aware on land-ness.) |
| T4 | Titania, Protector of Argoth | "whenever a land you control is put into a graveyard from the battlefield, create a 5/3 Elemental" | M | a land-dies event (the gyEnter machinery with cardType Land, fromZone battlefield) + token | ✅ (+1 corpus — the LAND twin of the artifact / enchantment "you control is put into a graveyard from the battlefield" watchers (scope `landYouControlPiG` on the permanentLeaves look-back, graveyard exit only — a bounced land never fires); the ETB land reanimate and the Elemental token already parsed.) |
| T5 | Thespian's Stage | "{2}, {T}: this land becomes a copy of target land, except it has this ability" | L | the copy lane on a land (Shifting Woodland / Mycosynth Gardens share it) | ⬜ |
| T6 | Demolition Field | sac: destroy target nonbasic land an opponent controls; then each of you searches for a basic | M | destroy nonbasic land + the two-sided basic tutor rider | ✅ (+1 corpus — the removal-rider fold learned the possessive subject ("that land's controller may search …", the Path to Exile rider untapped); the trailing "You may search …" is the optional basic tutor the fold already hands back as its own atom; the destroy-nonbasic-land target and the sacrifice-this-land cost existed.) |
| T7 | Tasigur, the Golden Fang | mill two, return a nonland card of an opponent's choice | M | an opponent's-choice pick (the AI policy: worst card) | ✅ (+1 corpus — the non-targeted single return (④-AA) learned "of an opponent's choice": the milled-pick pause is aimed at the controller's first opponent with a new `owner` seat (the controller's graveyard → the controller's hand), candidates worst-first so the AI's deterministic first pick is the least-wanted card; "nonland" joined the graveyard-filter vocabulary as the one admitted negation. Delve was already credited.) |
| T8 | Tolaria West | transmute | M | a discard-from-hand tutor by mana value (the channel lane's cousin) | ✅ (+1 corpus — the from-hand discard lane (cycling generalized; the NEO Channel lands) reads a "Transmute {cost}" keyword line as the ability it is (CR 702.53a): the search is spelled out at THIS card's printed mana value (a land's is 0) and a `sorceryOnly` flag holds the offer to an empty stack. Tolaria West is a full land; the thirteen other transmute carriers gain the lane at runtime with no tier change.) |
| T9 | Breach the Multiverse | each player mills ten; for each player choose a creature/planeswalker card from their graveyard, put onto the battlefield under your control… they're Phyrexian | L | mass mill + multi-graveyard picks + control | ⬜ |
| T10 | Six | during your turn, nonland permanent cards in your graveyard have retrace | L | retrace (cast from graveyard by discarding a land) | ⬜ |
| T11 | Overlord of the Balemurk | impending + mill four, return a non-Avatar creature or planeswalker card | L | impending is a subsystem | ⬜ |
| T12 | Colossal Grave-Reaver | "whenever one or more creature cards are put into your graveyard from your library, put one onto the battlefield" | M | gyEnter batch from library + a pick | ⬜ |
| T13 | Ardyn, the Usurper | Starscourge — exile up to one creature card from a graveyard, it becomes a copy… | L | | ⬜ |
| T14 | Subterfuge | ETB grants flying + a quoted combat-damage trigger to target creature | M | the quoted-grant lane on a target (the quoted-grant statics family) | ⬜ |
| T15 | COMPOSITE | Glacial Chasm · Animate Dead · Revitalizing Repast · Talon Gates of Madara · Dark Depths · River Kelpie | size on approach | Dark Depths + Thespian's Stage is the deck's combo — Dark Depths' cumulative-upkeep-ish ice counters + the Marit Lage token is an L | ⬜ |

### 5.2 Brago Blink — 74% · needs 11 · flicker deck

| Row | Card | Blocker | Size | Note | Status |
|---|---|---|---|---|---|
| B1 | Glasspool Mimic · Witch Enchanter | MDFC | V1 | | ⬜ |
| B2 | Proft's Eidetic Memory | | V5 | | ✅ |
| B3 | Peter Parker's Camera · Strionic Resonator | copy target ability | V6 | | ✅ |
| B4 | Reflector Mage | ETB bounce target creature an opponent controls; its owner can't cast spells with the same name until your next turn | M | the name-lock rider ("can't cast spells with that name" — a per-player cast restriction until the flicker-er's next turn) | ✅ (+1 corpus — the splitter folds the two sentences to a sentinel the bounce parser reads (`nameLockUntilNextTurn`); the bounce records a per-player NAME cast lock (state.nameCastLocks — owner, name, setter, turn) that the main cast loop refuses beside the noncreature lock, and the setter's next untap step expires (CR 611.2b). Sole carrier.) |
| B5 | Recruiter of the Guard | ETB tutor a creature with toughness ≤2 to hand | S | the tutor lane with a toughness filter | ✅ (+2 corpus — the tutor-to-hand arm reads "with toughness N [or less]" / "with power N [or less]" beside its mana-value cap, enforced in the shared matcher on the PRINTED stat (a "*" stat is never a candidate). Unplanned twin audited whole-card: Imperial Recruiter (power 2 or less — its whole text).) |
| B6 | Teleportation Circle | end step: exile up to one target artifact or creature you control, then return it | S | the blink atom on a delayed self-return (Cloudshift's shape on an end-step trigger) | ✅ (+2 corpus — a blink arm for "[up to one] target artifact or creature you control, then return …" on a new own-side artifactOrCreature target union (spellEffects' enumerator, the Ghostly Flicker triple minus lands) and the splitter's keep-whole guard widened to the form. The end-step trigger existed. Unplanned twin audited whole-card: Against All Odds (choose one or both — the same blink + the modeled mana-value-≤3 artifact-or-creature reanimation).) |
| B7 | Unquestioned Authority | enchanted creature has protection from creatures | S | protection-from-creatures grant (the protection layer op with a `creatures` source class) | ✅ (+3 corpus — the protection seam gains its first SOURCE-CLASS quality: printed reader + the Aura/Equipment have-tail grant (addProtection `classes`) + a layer union, ENFORCED at block (no creature may block), combat damage (prevented) and creature-sourced ability targeting (the flush's ctx.sourceId, layer-aware). Holy Mantle / Spirit Mantle ride the same have-tail after their P/T peel. Also closes the interim-FP on the printed carriers (Beloved Chaplain, Commander Eesha, Teysa) — credited before, enforced now. Filtered classes still park.) |
| B8 | Loran of the Third Path | {T}: you and target opponent each draw | S | a two-seat draw (Secret Rendezvous is the same shape ×3) | ✅ (+3 corpus — the draw atom gains who:`controllerAndTarget` ("You and target opponent each draw N": the controller, then the targeted seat; targetType opponent) and the clause splitter keeps the two-subject sentence whole. Unplanned twins audited whole-card: Secret Rendezvous (the sentence IS the card), Sky Crier (flying, lifelink + the same draw on a {3}{W} ability).) |
| B9 | Riptide Gearhulk | ETB: for each opponent, put up to one target nonland permanent they control into their library second from the top | M | per-opponent targeting + tuck-to-position | ⬜ |
| B10 | Brago, King Eternal | combat damage: exile any number of target nonland permanents you control, then return them | M | mass self-blink with an any-number pick (the counted pick UI is parked — the AI policy can pick "all ETB-bearing") | ⬜ |
| B11 | Anticausal Vestige | LTB: draw, then may put a permanent card with MV less than its power onto the battlefield | M | | ⬜ |
| B12 | Cryogen Relic | sac: stun counter on up to one target tapped creature | S | stun counter + tapped restriction (exist) | ✅ (+1 corpus — a bare put-stun-counter arm ("put N stun counter(s) on [up to one] target [tapped] creature") on the counter lane; the stun kind is the one untapOrConsumeStun already consumes at the untap step, the tapped restriction the enumerator already honors; the intent query reads a stun counter as harm (enemy-facing). The ETB/LTB draw and the sacrifice cost existed.) |
| B13 | Dour Port-Mage | "whenever one or more other creatures you control leave the battlefield without dying, draw" | M | leaves-without-dying batch event | ⬜ |
| B14 | Elesh Norn, Mother of Machines | permanents entering don't cause opponents' abilities to trigger | M | the Torpor Orb class: a trigger-suppression static consulted at the ETB flush | ⬜ |
| B15 | The Mightstone and Weakstone · The Mind Stone | restricted mana / harness | M / L | | ⬜ |
| B16 | COMPOSITE | Deadeye Navigator · Detention Sphere · Preston · Reality Acid · Skyclave Apparition · Soulherder · Thassa, Deep-Dwelling · Watcher for Tomorrow | size on approach | Skyclave = exile-until + token on leave (M); Soulherder/Thassa = end-step blink (S after B6) | ⬜ |

### 5.3 Nekusar Wheels — 71% · needs 14 · wheels deck

| Row | Card | Blocker | Size | Note | Status |
|---|---|---|---|---|---|
| N1 | Blightstep Pathway · Ojer Axonil · (Tergrid) | MDFC / transform | V1 | Ojer/Tergrid are TRANSFORM gods — L, not V1's land shape | ⬜ |
| N2 | Orcish Bowmasters | | V4 | | ✅ |
| N3 | Proft's Eidetic Memory | | V5 | | ✅ |
| N4 | Sheoldred, the Apocalypse | "whenever an opponent draws a card, they lose 2 life" (+ your draws gain 2) | S | the opponent-draw watcher exists (Phyrexian Tyranny is its unless-pay cousin) | ✅ (+1 corpus — the card-drawn trigger's PRONOUN referent: a clause-leading "they lose N life" rewrites to the drawing-player sentinel (the verb re-agreed), the same referent "that player" already took; the drawing-player lose-life arm existed.) |
| N5 | Forced Fruition | opponent casts → draws seven | S | cast watcher + draw-for-that-player (castingPlayer referent exists) | ✅ (+1 corpus — the draw atom's who:`castingPlayer` arm ("the casting player draws N cards" — the cast trigger's sentinel), reading ctx.castingPlayerId; the applier draws for the caster, never the ability's controller.) |
| N6 | Painful Quandary | opponent casts → loses 5 unless they discard | M | an unless-discard choice on the opponent's seat | ✅ (+1 corpus — the optional-discard-payment pause aimed at the CASTING seat with a decline penalty (`declineLoseLife`): decline, or an empty hand, costs that player 5; the AI discards iff it can.) |
| N7 | Phyrexian Tyranny | draw → lose 2 unless pay {2} | M | the pay-or-lose choice (the taxed-payment infra) on a draw watcher | ✅ (+2 corpus — the Rhystic Study pause aimed at the DRAWING seat with the decline landing on the PAYER as life loss (declinePayoff `loseLife`); every seat is hit, the controller included; the AI pays iff it can afford. Unplanned twin audited whole-card: Isolation Cell (an opponent's creature spell → the same pay-or-lose on the casting seat).) |
| N8 | Bedevil | destroy target artifact, creature, or planeswalker | S | a three-type union target | ✅ (+1 corpus — a destroy/exile arm on "artifact, creature, or planeswalker"; the union predicate already existed for Planar Disruption's enchant line; registered on the trigger-flush gate's chosen-permanent list.) |
| N9 | Bojuka Bog | ETB exile target player's graveyard | S | | ✅ (closed by T1c — "exile target player's graveyard" got its target side; Bojuka Bog reads `land`) |
| N10 | Dark Deal · Incendiary Command (mode) · Wheel and Deal | discard-hand-then-draw-that-many(-minus-one) shapes | S/M | the wheel core is native; these are count-referent variants ("that many", "minus one", targeted opponents) | ✅ Dark Deal + Incendiary Command (+2 corpus — the splitter keeps "…, then draws that many cards [minus one]" whole; Tolarian Winds' composite (discard-hand-draw-same) gains who:`eachPlayer` + `minus`: every seat's own count read first, all hands pitched through the shared discard-all, then each draws its own count less the minus, floored at zero). 🅿 **Wheel and Deal** — "any number of target opponents each discard their hands, then draw seven" is an any-number PLAYER target set (no lane); stays arbiter, its own row if the deck needs it. |
| N11 | Peer into the Abyss | target player draws half their library and loses half their life | M | | ✅ (+1 corpus — ONE targeted composite on a whole-oracle matcher: the target draws ceil(library/2) through the draw chokepoint and loses ceil(life/2) through loseLife, both read live at resolution; enemy-facing intent. Sole carrier.) |
| N12 | Teferi's Puzzle Box | each draw step: that player puts hand on bottom, draws that many | M | draw-step event (exists since ④-AY) + hand-to-bottom + count | ✅ (+1 corpus — the splitter keeps the sentinel sentence whole; one composite atom (hand-to-bottom-draw-same, who:`upkeepPlayer`) tucks the referent's hand to the bottom in hand order and draws that many THROUGH the trigger-firing draw chokepoint, so Sheoldred / Tyranny see the draws. Follow-up: the N10 wheel's draws now go through the same chokepoint.) |
| N13 | Chaos Warp | shuffle target permanent in, reveal top, may put it onto the battlefield | M | | ⬜ |
| N14 | Library of Leng · The Locust God · Molten Psyche · Ghyrson Starn · Wheel of Misfortune | | M / L / 🅿 | Wheel of Misfortune's secret bids = hidden-info 🅿 CEILING; Molten Psyche = metalcraft damage (M) | ⬜ |
| N15 | COMPOSITE | Baleful Mastery · Dauthi Voidwalker · Insatiable Avarice · Razorkin Needlehead · Silent Arbiter · Solphim | size on approach | | ⬜ |

### 5.4 Shorikai Vehicles — 70% · needs 15 · Vehicle deck (crew is native; the payoffs are not)

| Row | Card | Blocker | Size | Note | Status |
|---|---|---|---|---|---|
| S1 | Emeritus of Truce · Hengegate Pathway · Cosima | MDFC / transform | V1 | Cosima is a transform god (L) | ⬜ |
| S2 | Minamo | | V3 | | ✅ |
| S3 | Thunderhawk Gunship | attacks → attacking creatures you control gain flying | S | attacks trigger + team keyword grant (exist) | ✅ (+1 corpus — the group-grant lane's OWN-side attacker batch: scope `attackingCreaturesYouControl` = the live attacker set filtered to the controller's creatures.) |
| S4 | Parhelion II | attacks → two 4/4 Angel tokens tapped and attacking | S | token ETB "tapped and attacking" rider (Endless Foot Assault wants it too) | ✅ (+2 corpus — the fixed-count token arm's trailing "that are [tapped and] attacking" rider, peeled before the main match; applyCreateToken registers the minted tokens as attackers against the trigger's defender. Unplanned twin audited whole-card: Leonin Warleader (the tapped form).) |
| S5 | Prodigy's Prototype | "whenever one or more Vehicles you control attack" → Pilot token with a quoted crew ability | M | batch attack event by type + quoted-grant token | ✅ (+1 corpus — the once-per-combat batch (youAttack) gains a subtype gate: `attackerSubtype` on the descriptor (threaded through the assembly beside requireSelfAttacking — an unlisted field is dropped and a dropped gate fires on ANY attack), checked at the fire site against the declared attackers' type lines. The Pilot half is S8's gate. Curated to Vehicles; a creature-type batch is the same shape, its own slice.) |
| S6 | Peacewalker Colossus | {1}{W}: another target Vehicle becomes an artifact creature until EOT | S | the animate lane on a chosen Vehicle (crew's twin) | ✅ (+1 corpus — a `vehicle` target pool, the "another" source exclusion, and `keepPrintedPt` on the animate applier (the Vehicle keeps its printed P/T; a 7b set would read 0/0 and bin it).) |
| S7 | Mobilizer Mech | "whenever this Vehicle becomes crewed" → animate another Vehicle | M | a becomes-crewed event | ✅ (+1 corpus — a self-scoped `becomesCrewed` event fired by the crew dispatch (checkBecomesCrewedTriggers, the becomes-tapped discipline) and the S6 animate arm's "up to one other" form (subset path + source exclusion, printed P/T kept).) |
| S8 | Shorikai, Genesis Engine | {1},{T}: draw two, discard one, create a Pilot token with a quoted crew ability | M | draw-discard + quoted-grant token | ✅ (+1 corpus — the draw-discard half already parsed; the Pilot token's QUOTED STATIC parked it: a third quoted-ability gate (parseTokenStaticAbility) canonicalizes "crews Vehicles as though its power were N greater" onto the minted token, and abilities.crewPowerBonus adds the boost at BOTH crew sites (offer + dispatch). Prodigy's Prototype mints the same Pilot and still parks on its batch attack event (S5).) |
| S9 | Sai, Master Thopterist | {1}{U}, sacrifice two artifacts: draw | S | sacCount cost (exists) + draw | ⬜ |
| S10 | Surgehacker Mech | ETB damage = twice the number of Vehicles you control | S | countFor permanentsYouControl subtype Vehicle × per 2 | ✅ (+2 corpus — the count-damage lane gains a `twice` multiplier (per 2), the Vehicle subtype on the curated count table, and the opponent-scoped creature-or-planeswalker target. Unplanned twin audited whole-card: Jet, Freedom Fighter (the plain creature count; its dies trigger was already modeled).) |
| S11 | Permission Denied | counter noncreature; opponents can't cast noncreature spells this turn | M | a per-turn cast-type lock on opponents | ✅ (+2 corpus — a turn-stamped cast-type lock on every opponent (state.castLocksThisTurn, self-expiring with the turn number — the FOG latch's discipline); the cast loop refuses non-creature cards for a locked seat. Unplanned twin audited whole-card: Ranger-Captain of Eos (its sacrifice ability prints the same sentence; the ETB tutor was already modeled).) |
| S12 | Emry, Lurker of the Loch | {T}: choose target artifact card in your graveyard; you may cast it this turn | M | the "may cast from graveyard this turn" permission (the Six/retrace family's cousin) | ⬜ |
| S13 | The Indomitable | may cast from graveyard while you control three or more tapped Pirates/Vehicles | M | | ⬜ |
| S14 | Imposter Mech · Ironsoul Enforcer · Narset's Reversal · Mechtitan Core | | L / M / M / L | Narset's Reversal = copy + bounce-spell (M) | ⬜ |
| S15 | Chain of Vapor | bounce + the sacrifice-a-land copy chain | 🅿 CEILING | the copy chain is a multi-player decision loop | 🅿 |
| S16 | Dispatch | metalcraft exile | S | the metalcraft intervening-if exists (Molten Psyche shares it) | ✅ (+1 corpus — the ADDITIVE targeted conditional (no "instead"): tap always, exile too under metalcraft; narrow by design (a single chosen-creature base, an alternative naming "that creature" bound through the sentinel, the base inside both branches so ONE creature is chosen). The sentinel exile/destroy arm joined removal.js.) |
| S17 | COMPOSITE | Born to Drive · Katsumasa · Kotori · Mech Hangar · Mu Yanling · Nautiloid Ship · Padeem · Plaza of Heroes · Windbrisk Heights | size on approach | sized 2026-09-04: Mech Hangar S ✅ · Kotori ✅ (+1 — a layer-6 crew-number grant read at both crew sites as min(printed, granted); the trigger's grant arm came with Plaza) · Katsumasa M (animate-with-flying + a 1/1 base unless Vehicle; up-to-three counters) · Born to Drive M (a gated dynamic-count pump on an Aura + channel) · Padeem ✅ (+2 with Leonin Abunas — the noncreature-artifact hexproof shield + the greatest-artifact-MV intervening-if) · Plaza of Heroes ✅ (+6 with five twins — "legendary" spend word; the among-legendary colour line de-laundered; the legendary grant + the artifact-creature-you-control grant Kotori's second half needs; the extras builder keeps restricted lines) · Mu Yanling L (planeswalker) · Nautiloid Ship L ("exiled with this Vehicle") · Windbrisk Heights L (hideaway) | 🔄 Mech Hangar ✅ (+1 corpus — "pilot" joined the restricted-spend type words; the S6 animate arm gained the UNSCOPED "target Vehicle" form (any controller, printed P/T kept; a scope-less "another" parks); and the fixed-type restricted any-colour line joined EXTRA_MANA_LINE_RE so the runtime OFFERS it (with its restriction) — without that the land credit was hollow, the credited-but-never-offered class the memory flags). |

### 5.5 Kellan of the west — 70% · needs 15 · top-of-library deck (the wall: play-from-top)

| Row | Card | Blocker | Size | Note | Status |
|---|---|---|---|---|---|
| K1 | Branchloft · Barkchannel · Hengegate Pathways · Aang · Yangchen | MDFC / transform | V1 | the two Avatar cards are transform DFCs (L) | ⬜ |
| K2 | Starting Town | | V2 | |✅ |
| K3 | Transcendent Dragon | ETB if cast: counter target spell; if countered, exile and you may cast it… | M | | ⬜ |
| K4 | Monk Gyatso | "whenever another creature you control becomes the target…" you may untap it / copy? | M | the becomes-target event exists (Kira) | ⬜ |
| K5 | Rashmi, Eternities Crafter ✅ (+1 — the cast watcher already threads castSpellMv; one reveal-top atom ending in the discover park) | first spell each turn: reveal top; if it costs less, cast it free | L → S | the top-of-library-play subsystem (One with the Multiverse, Eladamri, Mystic Forge, Fblthp, The Reality Chip share it) — THE WALL. Build as one L in its own slice or call the ceiling. | ⬜ |
| K6 | Mind's Dilation | opponent's first spell each turn: exile their top card, you may cast it free | L | 🅿 PARKED 2026-09-04 — casting an OPPONENT's card needs a spell-owner seam (plan §6) | 🅿 |
| K7 | Make Your Own Luck ✅ (+1 — the impulse-dig pause with a PLOT destination and a HAND rest) · Unexpected Results · Portent of Calamity | look-at-top / reveal-and-cast shapes | M ✅ / M / L | | ⬜ |
| K8 | Sakashima's Protege · Planar Nexus ✅ · Ellie and Alan ✅ (+1 — the exiled cost card's mana value stamped like sacrificedForCost; discover reads it) · The Key to the Vault ✅ (+1 — a damage-sized dig parked behind the discover decision with a leave-exiled decline) | clone / every-nonbasic-type / discover-X-from-graveyard / look-that-many | L / S ✅ / M / M ✅ | Planar Nexus = the ④-BE layer-4 subtype add with every nonbasic land type (S) | ⬜ |
| K9 | COMPOSITE | Recurring Insight ✅ (+1 — the hand-size draw count; rebound was modeled) · Fblthp ✅ (+5 with Angel of Fury / Cavalier of Gales / Alabaster Dragon / Livewire Lash — draw-two-instead on the zone stamps; the standalone becomes-target event; shuffle-self-into-library incl. the graveyard form) · Mystic Forge ✅ (+2 with Precognition Field — a FILTERED play-from-top with a colourless test, and the own exile-top activation) · Jace Reawakened · Bonny Pall · Doc Aurlock ✅ (+1 — the named-zone reducer + a plot-cost reduction at the offer) · Lock and Load ✅ (+1 — a per-turn instant/sorcery tally, the 'other' count, a splitter keep-whole for the type pair) · Savvy Trader ✅ (+2 with Sage of the Beyond — the play-while-exiled ETB on the extended impulse window; a cast-ZONE cost reducer, fromZone threaded through costReductionForSpell) · Step Between Worlds ✅ (+1 — a per-seat 'may' pause, APNAP, only the yes-seats fold; the 85th card) · Tezzeret the Seeker | size on approach | most sit on the K5 wall | ⬜ |

**Ceiling note:** without the top-of-library-play subsystem Kellan tops out near 80. Decide at approach: build the
subsystem as its own multi-slice L (it also pays in Omnath's shelf-neighbours: Courser/Oracle-class cards corpus-wide),
or write the ceiling and move on. The runbook's default: build it — it is the largest single lever left on the shelf.

### 5.6 Shalai and Hallar Test — 69% · needs 16 · counters/legends deck

| Row | Card | Blocker | Size | Note | Status |
|---|---|---|---|---|---|
| H1 | Shatterskull · Witch Enchanter · Sundering Eruption · Bridgeworks · Miles Morales | MDFC / transform | V1 | Miles Morales is a transform DFC (L) | ⬜ |
| H2 | Starting Town | | V2 | |✅ |
| H3 | Scythecat Cub | | V10 | |✅ |
| H4 | Ragavan | combat damage: Treasure + exile their top card, may cast it this turn | **L** (re-sized 2026-09-04) | Treasure (exists) + impulse from an opponent's library (the impulse-exile lane with an owner switch) — SIZED: nothing in the engine casts an OPPONENT'S card; ownership must flow exile → stack → permanent / graveyard (a foreign-owner seam across the dispatcher's splice, createStackObject, and both engine graveyard moves) plus the 'you may CAST that card' verb and a Treasure-conjunction fold. Seven sites. After the M rows | ⬜ |
| H5 | Krenko, Tin Street Kingpin | attacks: +1/+1 counter, then Goblins = its power | S | attacks trigger + add-counter self + tokens countFor sourcePower (④-AW's reader) | ✅ (+5 with Jacked Rabbit / Royal Talon Fighter Jet / Rampant Rejuvenator / Big Mother Mouser — the possessive rewrite, the source-power count phrase, the 'a number of … equal to' token form, and the DIES LOOK-BACK the two dying twins needed) |
| H6 | Yoshimaru, Ever Faithful | another legendary permanent enters → counter on Yoshimaru | S | ETB watcher with a `legendary` filter | ✅ (+2 with Gimli — the another-permanent etb watcher gained a supertype filter, listed in the assembly, enforced at scopeMatches) |
| H7 | Spider-Man, Miles Morales | enters or attacks: +1/+1 counter on each other creature you control; those creatures gain trample | S | the "those creatures" referent over an each-OTHER spray — a fourth mass-antecedent kind whose group grant carries excludeSource | ✅ (+1) |
| H8 | Arwen, Weaver of Hope | each other creature you control enters with additional counters = Arwen's toughness | M | an enters-with modifier static | ✅ (+2 with Bramblewood Paragon — the `othersEnterWithCounters` reader; the resolver reads every OTHER permanent's descriptor as a creature enters; coverage strips on the same reader. Renata stays body-only on her devotion CDA; Master Biomancer / Metallic Mimic unmatched by design) |
| H9 | Damning Verdict | destroy all creatures with no counters on them | S | mass destroy + a `hasCounter` negation (④-AC's restriction, negated) | ✅ (+1 — the counter restriction joined the parser; the evaluator learned the negation) |
| H10 | Hajar, Loyal Bodyguard · Boromir, Warden of the Tower | sacrifice self: team +1/+0 / indestructible | S | (Boromir's "the Ring tempts you" tail = the ring subsystem → 🅿 unless built) | ✅ Hajar (+1 — a legendary-only team pump; the splitter keep-whole takes the prefix) · 🅿 Boromir (the Ring tempts you = the ring subsystem, unbuilt) |
| H11 | Kutzil, Malamet Exemplar · Skrelv · Incubation Druid · Uncivil Unrest · Shifting Woodland | | S / L / M / S / L | Kutzil = the above-base-power combat-damage BATCH (live layered dealer gate) · Uncivil Unrest = the counter-gated creature damage doubler (+ a residue the static checker models) · Incubation Druid = the "any type a land you control could produce" mana line (a new source kind) · Skrelv = colour choice + hexproof-from + can't-be-blocked-by colour · Shifting Woodland = delirium copy | ✅ Kutzil + Uncivil Unrest (+2) · ⬜ Druid (M) · ⬜ Skrelv (L) · ⬜ Woodland (L) |
| H12 | Chaos Warp | owner tucks target permanent, shuffles, reveals top; permanent card → battlefield | M | shared with Nekusar N13 | ✅ (+1 — ONE whole-oracle atom `owner-tuck-reveal-put`; the owner read BEFORE the move, a stolen permanent goes home; Oblation's shape stays unparsed) |
| H13 | COMPOSITE | Winds of Abandon · Skyclave Apparition · Solitude · Kami of Celebration · Galadriel's Dismissal · Innkeeper's Talent · Cloud's Limit Break · Endurance · Trouble in Pairs · Clever Concealment | SIZED 09-04: Kami S ✅ · Solitude ✅ 2026-09-05 (H13b: the other-target qualifier + the controller rider; EVOKE built — the pitch alt cost, the evoked stamp, the sacrifice queued under the ETB) · Endurance M (target player tucks their graveyard + evoke) · Skyclave M (mv-capped exile + linked-exile token on leave) · phasing UNMODELED (Galadriel's Dismissal, Clever Concealment = L) · Winds of Abandon L (overload + per-controller basic search) · Cloud's Limit Break L (tiered) · Innkeeper's Talent L (Class) · Trouble in Pairs L | Solitude/Endurance = evoke (the composition defect report of 09-03: build the evoke composition rule once, it pays in five decks) | ✅ Kami (+1 — the modified-attack predicate + the cast-from-exile zone gate) · rest ⬜ |

### 5.7 Otharri Test — 68% · needs 17 · Rebels/tokens deck

| Row | Card | Blocker | Size | Note | Status |
|---|---|---|---|---|---|
| O1 | Needleverge · Sejiri Shelter · Shatterskull · Witch Enchanter · Sundering Eruption | MDFC | V1 | | ⬜ |
| O2 | Starting Town | | V2 | |✅ |
| O3 | Kirol, Attentive First-Year | tap two creatures: copy target triggered ability | V6 | |✅ |
| O4 | Rosie Cotton | | V7 | | ✅ |
| O5 | Anim Pakal | attack with non-Gnomes → counter on Anim, then Gnome tokens = counters | S | | ⬜ |
| O6 | Glimmer Lens | equipped creature and at least one other creature attack → draw | S | an attacks-with-company condition on the equipment trigger | ✅ (+5 — a `withCompany` descriptor flag on the equipped-creature attack trigger, dropped by the attack checker unless another attacker beyond the trigger's own creature was declared; the attack block only knew the singular "attacks" — the plural form never reached the classifier; a SELF-and-company arm with an optional company subtype came out of the flip-diff (Sokka / Paired Tactician had flipped as plain attack triggers — an over-fire); For Mirrodin! was already modelled; pinned: with company one trigger and a draw, alone nothing, two others without the equipped bear nothing, the twins alone 0 / with the printed company 1) |
| O7 | Minas Tirith | {1}{W},{T}: draw; activate only if you attacked with two or more creatures this turn | S | an attackers-this-turn count condition (the RAID flag generalized to a count) | ✅ (+1 — the count arm on the intervening-if evaluator reads the per-permanent attacked-this-turn memo over the controller's board; a lower bound when an attacker has left; the tapped-unless static and the mana line were already whole; pinned: two attackers → offered and draws, one attacker with bystanders → not offered) |
| O8 | Tithe | tutor a Plains; a second if target opponent controls more lands | M | a targeted-opponent compare rider on the tutor's pick count | ✅ (+1 — ONE tutor atom: a Plains hand fetch, targeted at an opponent, with `extraIfTargetControlsMore`; applyTutor reads the chosen opponent's tally against the controller's at resolution (CR 608.2) and adds the pick when STRICTLY greater; the "you may" is the chain's own find-optionality; the splitter folds the three sentences; the target intent is enemy (opponents-only pool); pinned: ahead 2 picks, ahead-but-declined 1, equal 1) |
| O9 | Blacksmith's Skill | target permanent gains hexproof + indestructible; if it's an artifact creature +2/+2 | M | permanent-scoped grant + a type-conditional rider | ✅ (+2 — the creature grant arm's PERMANENT twin (the splitter's keep-whole was nailed to "target permanent you control"); the rider is a bound-referent pump carrying `ifBoundTypes`, which applyPumpEffect checks against the target's LAYER-4 types at resolution — a plain creature and a non-creature artifact get the grant only, an artifact creature and an ANIMATED artifact get +2/+2; the loop's creature gate opened for the bound rider (the permanent pool tags every pick "permanent"); pinned all four) |
| O10 | Zack Fair · Staff of the Storyteller · Inti · Diamond City · Patrolling Peacemaker · Otharri (self-reanimate) | | M+ (LKI counters + Equipment reattach) / ✅ Staff (+1 — the batched creature-token event) / ✅ Inti (+3 — the batched discard event + the next-end-step window) / M+ (a land entering with a shield counter, a move-counter op, and an entered-count condition — none exist; sized up 2026-09-05) / 🅿 (crime) / ✅ Otharri's self-return (+2 with Purple Pentapus — the tap-an-untapped cost on the graveyard recursion arm) | | ⬜ (the rest sized up on probe, 2026-09-05 — Reroute Systems, the one S in this deck's tail, shipped under O11's composite) |
| O11 | COMPOSITE | Everflowing Chalice · Solitude ✅ · Hour of Reckoning ✅ (+1 — nontoken wipe) · Reroute Systems ✅ (+2 with Loran's Escape — the artifact-or-creature grant) · Neyali · Galadriel's Dismissal · Ocelot Pride · Talon Gates · Crumb and Get It · Divine Resilience · Windcrag Siege · Cloud's Limit Break · Reroute Systems · Clever Concealment | size on approach | | ⬜ |

### 5.8 Bumble Flower Combo — 64% · needs 21 · Food/tokens deck

| Row | Card | Blocker | Size | Note | Status |
|---|---|---|---|---|---|
| F1 | Dusk // Dawn | split card | L | split cards (Double Jump too) are their own composition rule — size with V1's slice 3 | ⬜ |
| F2 | Rosie Cotton · Arcade Cabinet · Gingerbrute ×2 · Tough Cookie ×2 | | V7 / V8 / V14 | | ✅ |
| F3 | Ms. Bumbleflower | cast → target opponent draws; +1/+1 counter on target creature; it gains flying | S | | ⬜ |
| F4 | Academy Manufactor | Clue/Food/Treasure → one of each | S | a token-minting replacement (the Donatello class shares the seam) | ✅ (+1 — `tokenOneOfEach` on the doubler profile (the Took extra-Food seam); at the mint chokepoint each Clue/Food/Treasure in the batch spawns the two missing kinds raw in the same event, one pass per Manufactor the creator controls (two → three of each, the printed ruling); NOT multiplied by a token doubler — with Anointed Procession one Food is two of each in either replacement order; pinned: one Manufactor 1/1/1, a Soldier untouched, the opponent's Manufactor inert, two Manufactors 3/3/3, doubler 2/2/2) |
| F5 | Study the Classics ✅ · Treebeard (sized UP 2026-09-05: a subtype-union target pool + "halfling" in the allowlist + a lifegain that-many-on-TARGET sentinel — three seams, ~1 card; the bare subtype-target vein is 24 uses corpus-wide) · Wave Goodbye ✅ · Secret Rendezvous ✅ · Riot Control ✅ · Kwain ✅ | counters/lifegain/mass bounce/draw shapes | S each | Wave Goodbye = mass bounce with a no-counter filter | ⬜ |
| F6 | Heaped Harvest ✅ (+2 — the compound head's second half "when you sacrifice it" + the self-sac cost guard exemption; Carrot Cake rode along) · Elanor Gardner ✅ · Lembas ✅ · Sam, Loyal Attendant ✅ · Samwise Gamgee ✅ · Samwise the Stouthearted (sized UP — the ETB is native since Continue?; "Then the Ring tempts you" is an unmodelled mechanic) · Hot Soup ✅ · Field-Tested Frying Pan · Night of the Sweets' Revenge ✅ · Feasting Hobbit ✅ · Campsite Cuisine (sized UP — the head is an unmodelled union scope AND the attack line is an optional X-sacrifice reflexive) · Shoreline Looter ✅ · Archway of Innovation · Continue? ✅ | | S–M | the Food family: "when you sacrifice it" (S), "if you sacrificed a Food this turn" (S), devour Food (M), improvise grant (M) | ⬜ |
| F7 | Eriette's Tempting Apple | gain control | ⛔ THEFT | | ⛔ |
| F8 | COMPOSITE | Innkeeper's Talent · Killer Service (sized L — the "number of opponents you have" token count is an unmodelled source AND the end step is an optional pay+sacrifice reflexive) · Long River's Pull ✅ (gift) · Mechanized Production · Peerless Recycling ✅ (gift) · Wear Down ✅ (gift) · Wedding Ring · Tamiyo, Field Researcher | size on approach | | ⬜ |

### 5.9 Atraxa Superfriends — 64% · needs 21 · planeswalker deck

> ⛔ **ATRAXA CEILING at 74 (2026-09-05, 11 to the bar):** every remaining row sizes L — Interplanar Beacon (the cast filter's planeswalker denylist + a two-colour paid production), Ashiok (a static forbidding opponents' searches), Kiora (an until-your-next-turn shield expiry + a source-side "dealt by" prevention), and the A5 loyalty-vocabulary sweep. Phase 3 material; the §5 order moved on to Halfshell.

| Row | Card | Blocker | Size | Note | Status |
|---|---|---|---|---|---|
| A1 | Maze of Ith ×2 | | V13 | |✅ |
| A2 | Interplanar Beacon (sized UP — "planeswalker" sits in the cast filter's denylist AND the {1},{T} two-different-colours line is a paid production the mana model has no field for) · Oath of Gideon ✅ (+1 — the extra loyalty on entry) · Sphere of Safety ✅ (+1 — the counted tax) · Norn's Annex ✅ (+1 — the Phyrexian tax) | cast-planeswalker lifegain / extra loyalty / attack tax | L / S / S / M | Sphere of Safety's tax is the ④-AK attack-tax family with a count-of-enchantments amount; Norn's Annex taxes {W/P} (life-or-mana) | ⬜ |
| A3 | Arena Rector ✅ (+2 — the "If you do" optional exile-self payment + the planeswalker fetch onto the battlefield; Academy Rector's enchantment form stays parked on purpose) · Deploy the Gatewatch ✅ (+1 — the counted dig) · Ashiok (sized L — a static that forbids opponents' searches) · Mutational Advantage ✅ (+1 — the counters-scoped PERMANENT grant + the GROUP all-damage shield + proliferate, one composite) | | M / S / L / M | | 🔶 |
| A4 | Garruk, Unleashed ✅ (+1 — the self-named loyalty counter) · Kiora, the Crashing Wave (sized UP to L, 2026-09-05 — the +1 needs an UNTIL-YOUR-NEXT-TURN shield expiry (the store keys shields to the current turn only) AND a source-side "dealt BY" prevention that neither damage path has; the −1 and the −5 emblem already parse) · Teferi, Hero of Dominaria ✅ (+1 — the positional tuck) | single loyalty lines | S / M / M | the loyalty-ability parser reads per line; each is one arm | 🔶 |
| A5b | Dueling Grounds ✅ (+3 — the global combat cap; Silent Arbiter and Caverns of Despair rode along) | attack / block cap | S | | ✅ |
| A5 | COMPOSITE (the planeswalkers) | Ajani Steadfast · Dovin Baan · Elspeth Resplendent · Kaya · Narset Transcendent · Narset, Parter of Veils · Oko · Sorin Markov · Sorin, Grim Nemesis · Tamiyo · Teferi, Master of Time · Teferi, Time Raveler · The Eternal Wanderer · Ugin · Vraska the Unseen · Carth · Astral Cornucopia · Avatar's Wrath · Dueling Grounds · Innkeeper's Talent · Oath of Nissa · Oath of Teferi · Primevals' Glorious Rebirth · Urza's Ruinous Blast | **L — "the loyalty vocabulary sweep"** | one slice: probe every loyalty line in the deck, build the missing arms as a family (emblems, static PW abilities, +1 team buffs, ultimates that need a subsystem get 🅿) | ⬜ |

**Ceiling note:** Atraxa likely stops near 80–85 without the sweep; the sweep is the deck.

### 5.10 Halfshell heroes — 64% · needs 21 · counters/Turtles deck

> ⛔ **HALFSHELL CEILING at 83 (2026-09-05, 2 to the bar):** every remaining row sizes L — Turtle Lair (restricted-spend mana, the quartet subsystem), Coin of Mastery (mana-source tracking), Special Move (a two-target mode), Everything Pizza (four sentences, three target kinds), Heroes in a Half Shell (plural subject + batch referent), Together Forever (a delayed trigger from an activation), Shellshock (per-opponent up-to-one targets), Raphael the Muscle (a counters-filtered damage doubler), Bebop (the if-you-do lane), Tempestra (copy-token + haste + delayed sacrifice), Double Jump (split/fuse). Phase 3 material; the §5 order moved on to Light-Paws.

| Row | Card | Blocker | Size | Note | Status |
|---|---|---|---|---|---|
| Q1 | Double Jump // Flying Kick | split | L (V1 slice 3) | | ⬜ |
| Q2 | Arcade Cabinet · Path of Ancestry | | V8 / V11 | | ✅ |
| Q3 | Casey Jones ✅ (+1 — the active counters-placed damage payoff) · Ray Fillet ✅ (+1 — the with-a-counter dealer filter) · Together Forever · Tokka & Rahzar ✅ (+1 — the nontoken leaves scope; Splinter, the Mentor rode along on its self-inclusive union) · Baxter ✅ (+1 — the counter-filtered group grant) · Heroes in a Half Shell · Coin of Mastery · Raphael, the Muscle (sized L — a counters-filtered DAMAGE DOUBLER; no damage-doubling machinery exists; ⚠️ the deck's Raphael is NOT Fiendish Savior — sk100 read the bare name wrong and landed Fiendish Savior as a corpus gain) | counters-matter triggers and statics | S / S / M / S / S / M / M / M | Casey Jones = a counters-placed batch event (exists: countersPlaced) + damage; Ray Fillet = combat damage by a creature with a counter → draw; Raphael = a damage doubler filtered by "with counters" | ⬜ |
| Q4 | Big Apple ✅ (+3 — the opponent count; Inspired Sphinx and Chittering Witch rode along) · Big Mother Mouser ✅ · Shellshock · Swift Demise ✅ (+1 — the opponent-creature mass destroy) · Wave Goodbye · Continue? · Exploding Barrel ✅ (+4 — the per-counter activation discount rider) · Everything Pizza · Endless Foot Assault ✅ (+1 — per-opponent tapped-and-attacking tokens) · Splinter ✅ (rode along with Q3's nontoken leaves) · Foot Chopper (sized L — an optional sacrifice with no if-you-do lane) · Mole Module ✅ (+2 — the milled-pick's battlefield destination) · Bebop (sized L — the same if-you-do lane) · Tempestra · Irma · Dimension X Pizzasaur · Donatello ✅ (+1 — the Took extra-token replacement, Mutagen printing) | | S–M | Shredder's per-opponent copies = M; Irma's combat-start copy = M; Donatello's Mutagen replacement shares F4's seam | ⬜ |
| Q5 | COMPOSITE | Fast Forward · Rat King ✅ (rode along with Q3's nontoken leaves) · Lita ✅ (+1 — the period-form mode-memory lead) · Turtle Lair · Special Move · Vigor · Krang | size on approach | | 🔶 |

### 5.11 Killer Turts — 64% · needs 21 · extra turns / storm-ish red deck (23 arbiter-spells)

| Row | Card | Blocker | Size | Note | Status |
|---|---|---|---|---|---|
| X1 | Final Fortune · Last Chance · Warrior's Oath | | V12 | |✅ |
| X2 | Peter Parker's Camera | | V6 | | ✅ |
| X3 | Rite of Flame · Irencrag Feat · Geosurge | ritual mana with counts / spend restrictions | S / M / M | Geosurge/Irencrag = the QUARTET restricted-spend lane ("only artifact or creature spells"; "only one more spell this turn") | ⬜ |
| X4 | Guttural Response · Avoid Fate · Pyroblast · Redirect Lightning · Ricochet Trap | filtered counters / redirects | S / M / M / L / L | Guttural Response = counter with a colour+type filter (S) | ⬜ |
| X5 | Shinka · Port Razer · Last Night Together · Savage Beating · City of Traitors · Tibalt's Trickery · Scroll Rack · Carpet of Flowers | | S / S / S / M / S / M / M / M | | ⬜ |
| X6 | Gemstone Caverns · Veil of Summer | pregame / three-effect protection | 🅿 PREGAME / M | | 🅿 / ⬜ |
| X7 | COMPOSITE | Bolt Bend · Full Throttle · Great Train Heist · Grim Reaper's Sprint · Invasion of Ikoria · Jeweled Amulet · Not of This World · Open the Omenpaths · Overpowering Attack · Tezzeret, Cruel Captain · Untimely Malfunction · World at War · World War Hulk | size on approach | the extra-combat family (Full Throttle, World at War, Overpowering Attack) is one M vein | ⬜ |

### 5.12 Light-Paws Voltron — 61% · needs 24 · Aura deck

> ⛔ **LIGHT-PAWS CEILING at 81 (2026-09-05, 4 to the bar):** every remaining row sizes L — Light-Paws, Emperor's Voice (a conditional Aura tutor onto the battlefield attached, with a name filter), With Great Power (a per-attachment pump + damage redirection), Umbra Mystic (a group umbra-armor grant), Celestial Mantle (double a life total), Mantle of the Ancients (reattach any number), Angelic Destiny (an Aura-own dies-return trigger beside a subtype-adding bonus), Darksteel Mutation / Swift Reconfiguration (base-P/T + type-set Auras), Pariah / Spectra Ward / Benevolent Blessing / Reverent Mantra / Restoration Magic / Galadriel's Dismissal / Trouble in Pairs. Phase 3 material.

| Row | Card | Blocker | Size | Note | Status |
|---|---|---|---|---|---|
| L1 | Ishgard, the Holy See | MDFC | V1 | | ⬜ |
| L2 | Chains of Custody ×2 · Sheltered by Ghosts ×2 · Detainment Spell ×2 | | V15 | |✅ |
| L3 | Light-Paws, Emperor's Voice | aura you cast enters → tutor an Aura with lesser MV onto the battlefield attached | M | the deck's engine; an aura-cast watcher + tutor-to-battlefield-attached | ⬜ |
| L4 | Face of Divinity ✅ (sk107 — the another-Aura gate) · Solid Footing (sized M — an "as long as … has vigilance" conditional) · Gauntlets of Light ✅ (+2 — the toughness-assigns attached grant; Treefolk Umbra rode along) · Greater Auramancy ✅ (+1 — the enchanted-creatures selector) · Umbra Mystic · Shielded by Faith ✅ (sk108 — attach to the entering creature) · Brilliant Wings ✅ (sk108 — the same behind "you may pay {1}") · Sentinel's Mark ✅ (+2 — the Addendum main-phase look-back) · Shardmage's Rescue ✅ (sk107 — the entered-this-turn gate) · Celestial Mantle · With Great Power · Mantle of the Ancients | aura statics and triggers | S–M | Gauntlets/Solid Footing = "assigns combat damage equal to its toughness" (the layer op EXISTS: assignsCombatDamageWithToughness — S); Greater Auramancy = team shroud on enchanted creatures (S); Shielded by Faith / Brilliant Wings = a re-attach on ETB (M) | ⬜ |
| L5 | Winds of Rath ✅ (+1 — the enchanted predicate) · Karametra's Blessing ✅ (+1 — the enchanted-or-enchantment-creature keyword rider) · Enter the Avatar State ✅ (+1 — the becomes-a-subtype-and-gains pump) · Deafening Silence ✅ (+1 — the noncreature cast limit) · Drannith Magistrate ✅ (+1 — the cast-from-hand-only lock) | spells and statics | S / M / M / M / M | | 🔶 |
| L6 | COMPOSITE | Angelic Destiny · Benevolent Blessing · Darksteel Mutation (L — a base-P/T + type-set Aura) · Daybreak Coronet ✅ (+1 — the with-another-Aura Enchant restriction) · Galadriel's Dismissal (L — phasing) · On Thin Ice · Pariah · Pearl-Ear · Plaza of Heroes · Restoration Magic · Reverent Mantra · Silent Arbiter · Spectra Ward · Spirit Mantle · Swift Reconfiguration · Trouble in Pairs | size on approach | | ⬜ |

### 5.13 Kinnan Mana Overload — 72% · needs 13 · cEDH (NEXT after Killer Turts — Colton 09-05 override)

| Row | Card | Blocker | Size | Note | Status |
|---|---|---|---|---|---|
| I1 | Barkchannel · Sink into Stupor · Hydroelectric · Wandering Archaic | MDFC | V1 | | ⬜ |
| I2 | Minamo · Valley Floodcaller | | V3 / V9 | | ✅ |
| I3 | Thassa's Oracle | ETB: look at top X (devotion), win if library ≤ X | M | devotion count + a look/win atom (the win-game family exists with strict evaluators) | ⬜ |
| I4 | Transmute Artifact · Moonsilver Key · Treasure Vault · Cephalid Coliseum · The Mycosynth Gardens · Nezahal | | M / S / S / M / L / M | | ⬜ |
| I5 | Copy Enchantment · Clever Impersonator · Imposter Mech | clone lane | L | one clone slice pays all three | ⬜ |
| I6 | Gilded Drake | exchange control | ⛔ THEFT | | ⛔ |
| I7 | Gemstone Caverns | pregame | 🅿 PREGAME | | 🅿 |
| I8 | Chain of Vapor · Veil of Summer · The Unagi of Kyoshi Island | | 🅿 / M / M | | ⬜ |
| I9 | COMPOSITE | Tezzeret the Seeker · Mindbreak Trap · Flash Photography · Wan Shi Tong · Misdirection · Endurance · Hullbreaker Horror | size on approach | | ⬜ |

### 5.14 Believe it! — 71% · needs 14 · cEDH (LAST)

| Row | Card | Blocker | Size | Note | Status |
|---|---|---|---|---|---|
| E1 | Sea Gate Restoration · Agadeem's Awakening · Sink into Stupor · Fell the Profane · Boggart Trawler · Hydroelectric | MDFC | V1 | six slots | ⬜ |
| E2 | Orcish Bowmasters | | V4 | | ✅ |
| E3 | Thassa's Oracle | | I3 | | ⬜ |
| E4 | Thousand-Faced Shadow · Moon-Circuit Hacker · Shizo · Ingenious Prodigy · Nanogene Conversion · Roaming Throne · Satoru | | M / S / S / M / L / L / M | Roaming Throne = the extra-trigger family (Panharmonicon class — L) | ⬜ |
| E5 | Commandeer | gain control of target spell | ⛔ THEFT | | ⛔ |
| E6 | Gemstone Caverns · Doomsday · Tainted Pact · Demonic Consultation · Lim-Dûl's Vault | pregame / hidden-information piles | 🅿 PREGAME / CEILING | | 🅿 |
| E7 | COMPOSITE | Misdirection · Mindbreak Trap · Subtlety · Flare of Malice · Contagion · Kaito · Force of Despair · Emrakul, the Promised End | size on approach | evoke/pitch alt costs are one composition rule | ⬜ |

---

## 6. STAGE BOUNDARIES (where a run reports and may stop)

- **After Phase 1's veins** (V1–V15 each ✅ or 🅿): re-measure the whole shelf, update §1, wake-report block.
- **After each Phase 2 deck crosses 85** (or its ceiling is written): update §1 + the deck's section header, wake-report line.
- **After Phase 2** (every deck ≥85 or ceilinged): full wake-report block with the table.
- **After Phase 3**: same.
- **After Phase 4**: the final block — the table, the ceilings, the COMMS tag, the corpus number. Then stop.

Between boundaries: keep working. Do not report. Do not wait for Colton — anything that needs him goes into a row's
note and the Omnath list, and the run takes the next row.

---

## 7. THE RUNNING LOG (newest first — one line per slice)

- 2026-09-05 — Phase 2 · L4 Sentinel's Mark (Light-Paws) ✅ +2 corpus (the ADDENDUM look-back — "if you cast it during your main phase" — a main-phase stamp at the cast chokepoint, carried onto the entering Aura beside castFromZone, read by one condition arm) · mutants 5/5 killed · suite 1561 files / 16,367 · Light-Paws 80 → **81** (81/100; 4 to the bar) — LIGHT-PAWS CEILING for Phase 2 (noted in §5.12): every remaining row sizes L. Every open §5 deck now carries a ceiling (Atraxa 74 · Halfshell 83 · Light-Paws 81 · Bumble 88) → Phase 3 (§4.3, the hard-wins sweep) opens: instruments re-run, the 85–89 decks ≤3 rows from 90, the one-line-away probe for multi-deck S/M rows.

- 2026-09-05 — Phase 2 · L6 Daybreak Coronet (Light-Paws) ✅ +1 corpus (the "creature with another Aura attached to it" ENCHANT restriction → the existing enchanted restriction kind, honoured by the cast-target enumeration) · mutants 2/2 killed · suite 1560 files / 16,364 · Light-Paws 79 → **80** (80/100; 5 to the bar). Next: Sentinel's Mark (the Addendum main-phase look-back — the stamp, the reader and the Aura resolver are built; the CR 207.2c label strip in the Aura walks is the last piece). After it every remaining Light-Paws row sizes L (the commander's conditional Aura tutor-attached, With Great Power's per-attachment pump + redirection, Umbra Mystic's group umbra armor, Celestial Mantle, Mantle of the Ancients, the rest of L6).

- 2026-09-05 — Phase 2 · L5 Enter the Avatar State (Light-Paws) ✅ +1 corpus (the BECOMES-A-SUBTYPE-AND-GAINS pump — "becomes an Avatar in addition to its other types and gains <kws>" — a keyword pump with a layer-4 subtype-add rider until end of turn) · mutants 5/5 killed · suite 1559 files (1555 green + the 4 graduated-guard files rerun green) · Light-Paws 78 → **79** on this slice alone (the measure in this run read 80 because the Daybreak Coronet edit was already in the tree; Coronet's own commit follows). Next: Daybreak Coronet (S), then Sentinel's Mark (M).

- 2026-09-05 — Phase 2 · L4 Shielded by Faith + Brilliant Wings (Light-Paws) ✅ +4 corpus (ATTACH-ON-ENTER Auras — "you may attach this Aura to that creature" on a creature-enters watcher — one atom moving the SOURCE Aura onto the TRIGGERING creature, honouring the Aura's own Enchant line at the move; the pay-{1} form rides the optional-mana-payment lane) · mutants 4/4 killed · suite 1558 files / 16,360 · Light-Paws 76 → **78** (78/100; 7 to the bar). Next: Enter the Avatar State (the becomes-a-subtype-and-gains pump; the arm is built, the splitter needs its keep-whole guard), then Daybreak Coronet (S — the with-another-Aura Enchant restriction), then Sentinel's Mark (M — the Addendum main-phase look-back).

- 2026-09-05 — Phase 2 · L4 Face of Divinity + Shardmage's Rescue (Light-Paws) ✅ +2 corpus (the CONDITIONAL attached bonus — "as long as another Aura is attached to enchanted creature" / "as long as this Aura entered this turn" — the during-your-turn arm's shape with two SOURCE-aware layer gates, the Aura's id stamped where its bonus is fixed to the host) · mutants 6/6 killed · suite 1557 files / 16,356 · Light-Paws 74 → **76** (76/100; 9 to the bar). Next: Shielded by Faith + Brilliant Wings in ONE slice (attach-on-enter Auras — the source Aura moves onto the triggering creature).

- 2026-09-05 — Phase 2 · L5 Karametra's Blessing (Light-Paws) ✅ +1 corpus (the BOUND conditional keyword rider — "If it's an enchanted creature or enchantment creature, it also gains hexproof and indestructible" — the Aura-attached predicate OR the layer-4 Enchantment+Creature types, read at resolution on the previous atom's target) · mutants 5/5 killed · suite 1556 files / 16,353 · Light-Paws 73 → **74** (74/100; 11 to the bar). Next: Face of Divinity + Shardmage's Rescue in ONE slice (the conditional attached-bonus gate — the during-your-turn arm's shape with two new gate kinds).

- 2026-09-05 — Phase 2 · L5 Drannith Magistrate (Light-Paws) ✅ +1 corpus (the CAST-FROM-HAND-ONLY lock on opponents — "your opponents can't cast spells from anywhere other than their hands" — an always-on marker + ONE post-filter withholding every non-hand cast lane (graveyard, exile, command, library) from the controller's opponents) · mutants 4/4 killed · suite 1555 files / 16,349 · Light-Paws 72 → **73** (73/100; 12 to the bar). Next Light-Paws M row: Karametra's Blessing (a bound keyword rider under the enchanted-or-enchantment-creature condition — the Blacksmith's Skill shape).

- 2026-09-05 — Phase 2 · L5 Deafening Silence (Light-Paws) ✅ +1 corpus (the NONCREATURE variant of the one-spell-per-turn cast limit — the marker with noncreatureOnly + ONE post-filter over every cast-family action, judging the FACE being cast, keyed on the existing noncreatureSpellsCastThisTurn counter) · mutants 4/4 killed · suite 1554 files / 16,346 · Light-Paws 71 → **72** (72/100; 13 to the bar). Next Light-Paws M row: Drannith Magistrate (the cast-from-hand-only lock on opponents — the same post-filter shape, keyed on fromZone).

- 2026-09-05 — Phase 2 · Q4 Endless Foot Assault (Halfshell) ✅ +1 corpus (PER-OPPONENT tapped-and-attacking tokens — "for each opponent, create a 1/1 black Ninja creature token that's tapped and attacking that player" — one token per live opponent, each joining combat against ITS opponent) · mutants 4/4 killed · suite 1553 files / 16,343 · Halfshell 82 → **83** (83/100; 2 to the bar) — HALFSHELL CEILING for Phase 2: every remaining row sizes L (noted in §5.10). The §5 order moves to Light-Paws (71; every row M+): Deafening Silence first (the noncreature variant of the Rule of Law cast limit — the per-player noncreature cast count already exists).

- 2026-09-05 — Phase 2 · Halfshell Fast Forward ✅ +10 corpus (two arms: the MASS goad — "goad all creatures your opponents control" on the every-opponent-creature scope — and the per-opponent-attacked cast discount — a seat-level defender memo stamped at declare-attackers, cleared at untap, counted as distinct live opponents) · mutants 6/6 killed (the stripper mutant survived its first run and got its test — the Ghoultree pin) · suite 1552 files / 16,340 · Halfshell 81 → **82** (82/100; 3 to the bar). Remaining Halfshell: Endless Foot Assault (M+ — per-opponent tokens each attacking THAT opponent; next), the rest L.

- 2026-09-05 — Phase 2 · Q4 Mole Module (Halfshell) ✅ +2 corpus (the milled-pick's BATTLEFIELD destination — "mill four cards. You may put a permanent card from among them onto the battlefield" — the hand form's stamp ∩ live-graveyard pick, entering via enterCardFromZone; permanent gate CR 110.4a; Auras withheld CR 303.4f) · mutants 5/5 killed · suite 1551 files / 16,336 · Halfshell 80 → **81** (81/100; 4 to the bar). Remaining Halfshell rows: Fast Forward (M — a MASS goad arm + a per-opponent-attacked cast discount: two arms, next), Endless Foot Assault (M+ — per-opponent tokens each attacking THAT opponent), the rest L (Coin of Mastery, Special Move, Everything Pizza, Turtle Lair, Heroes in a Half Shell, Together Forever, Shellshock, Raphael the Muscle, Bebop, Tempestra, Double Jump).

- 2026-09-05 — Phase 2 · Q3 Raphael, Fiendish Savior (CORPUS — mis-aimed: the Halfshell row's bare Raphael is Raphael, the Muscle) ✅ +2 corpus (the from-anywhere graveyard LOOK-BACK — "if a creature card was put into your graveyard from anywhere this turn" — a per-player turn stamp at the graveyard chokepoint, cards only (CR 111.1), plus one condition reader) · mutants 4/4 killed · suite 1550 files / 16,332 · Halfshell UNCHANGED at 80 — ⚠️ MIS-AIMED ROW: the Q3 row's bare 'Raphael' is Raphael, the Muscle (a Mutant Ninja Turtle: a counters-filtered damage doubler — sized L, no doubling machinery — + a Mutagen ETB + Partner—Character select); I read it as Fiendish Savior. The +2 is corpus-only. Lesson: resolve a bare name against the deck's leftovers dump BEFORE sizing (the runbook row now names the Muscle in full). Next Halfshell M row = Mole Module (the milled-pick's battlefield destination — the hand form's machinery exists).

- 2026-09-05 — Phase 2 · Q4 Exploding Barrel (Halfshell) ✅ +4 corpus (the PER-COUNTER activation discount rider — "This ability costs {1} less to activate for each pressure counter on this artifact" — peeled as a cost modifier and priced live at the offer off the source's own counter bag, floored at {0}) · mutants 4/4 killed · suite 1549 files / 16,328 · Halfshell 79 → **80** (80/100; 5 to the bar) — next Halfshell M row = Raphael, Fiendish Savior (a per-player 'creature card put into your graveyard this turn' flag + one condition reader; the payoff already parses).

- 2026-09-05 — Phase 2 · A3 Mutational Advantage (Atraxa) ✅ +1 corpus (one composite: the counter-filtered group grant on the PERMANENT scope + the all-damage shield with a GROUP selector — the counter-bearing creatures and planeswalkers you control, read at resolution — + proliferate) · mutants 4/4 killed · suite 1548 files / 16,323 · Atraxa 73 → **74** (74/100; 11 to the bar) — ATRAXA CEILING for Phase 2: every remaining row now sizes L (Interplanar Beacon, Ashiok, Kiora — resized L today: an until-your-next-turn shield expiry plus a source-side 'dealt by' prevention — and the A5 loyalty-vocabulary sweep); the §5 order moves to Halfshell's M rows (Exploding Barrel first — only its per-counter activation discount rider parks it).

- 2026-09-05 — Phase 2 · A3 Arena Rector (Atraxa) ✅ +2 corpus (the optional-exile-self payment reads the "IF you do" wording beside "when you do" — Greenwarden of Murasa rides along — and the battlefield tutor admits a GUARANTEED-PLANESWALKER fetch; enchantments stay out: an un-cast Aura would land unattached, CR 303.4f) · mutants 3/3 killed (a 4th survived and its redundant guard word was deleted) · suite 1547 files / 16,320 · Atraxa 72 → **73** (73/100; 12 to the bar) — its remaining rows are M+/L; next = A3 Mutational Advantage (M: the counters-scoped PERMANENT grant + the group all-damage shield on those permanents + proliferate).

- 2026-09-05 — Phase 2 · L4 Gauntlets of Light (Light-Paws) ✅ +2 corpus (the toughness-assigns ATTACHED grant — "gets +0/+2 and assigns combat damage equal to its toughness rather than its power" on an Aura — the pump plus the existing layer-6 op, scoped to the host by the attached-bonus path) · mutants 3/3 killed · suite 1546 files / 16,315 · Light-Paws 70 → **71** (14 to the bar) — LIGHT-PAWS' S ROWS DONE; every remaining row sizes M+ (Karametra's Blessing's enchanted-or-enchantment rider, Face of Divinity / Solid Footing's as-long-as conditionals, Deafening Silence's per-turn cast count, Drannith's cast-zone lock, Umbra Mystic's granted umbra armor, Shielded by Faith / Brilliant Wings' re-attach ETBs, Sentinel's Mark's addendum, Celestial Mantle's life doubling, Light-Paws itself) or L (Mantle of the Ancients, With Great Power, Enter the Avatar State, Ishgard, the L6 composite)

- 2026-09-05 — Phase 2 · L4 Greater Auramancy (Light-Paws) ✅ +1 corpus (the team shield static's ENCHANTED-CREATURES subject — "enchanted creatures you control have shroud" — a layer selector gate reading an attached Aura, live) · mutants 4/4 killed · suite 1545 files / 16,313 · Light-Paws 69 → **70** (15 to the bar)

- 2026-09-05 — Phase 2 · L5 Winds of Rath (Light-Paws) ✅ +1 corpus (the ENCHANTED predicate — a creature with an Aura attached, whoever controls the Aura (CR 303.4) — as a restriction kind, negated on the every-creature wipe; the regeneration rider already stamped) · mutants 4/4 killed (one survivor got its missing test) · suite 1544 files / 16,311 · Light-Paws 68 → **69** (16 to the bar)

- 2026-09-05 — Phase 2 · Q3 Baxter, Fly in the Ointment (Halfshell) ✅ +1 corpus (the COUNTER-FILTERED group keyword grant — "each creature you control with a counter on it gains <kw> until end of turn" — the existing group grant with its counter filter widened to any kind) · mutants 3/3 killed · suite 1543 files / 16309 · Halfshell 78 → **79** (6 to the bar) — HALFSHELL CEILING for Phase 2: every remaining row sizes M+ (Turtle Lair's subtype-union unblockable + spend words, Endless Foot Assault's per-opponent attacking tokens, Exploding Barrel, Mole Module, Coin of Mastery, Raphael, Special Move's two low modes) or L (Heroes in a Half Shell's plural subject list + batch referent, Foot Chopper / Bebop / Together Forever / Dimension X's if-you-do and reflexive lanes, Vigor, Krang, Shredder, Irma, Tempestra, Fast Forward ✅ (+10, sk102 — mass goad + the attacked-opponents discount), Shellshock, Double Jump); per §2.4 the order moves to Light-Paws (68)

- 2026-09-05 — Phase 2 · Q4 Big Apple, 3 a.m. (Halfshell) ✅ +3 corpus (the OPPONENT COUNT as a count source — "for each opponent you have" — read live off the seat's opponents; every for-each consumer inherits it) · mutants 3/3 killed · suite 1542 files / 16,307 · Halfshell 76 → **78** across this and the Donatello slice (7 to the bar); Inspired Sphinx and Chittering Witch the unplanned gains, audited whole-card

- 2026-09-05 — Phase 2 · Q4 Donatello, the Brains (Halfshell) ✅ +1 corpus (the Took extra-token replacement's Mutagen printing — "those tokens plus a Mutagen token are created instead" — the same profile, the second modelled named kind, applied once per creation event at the mint chokepoint) · mutants 3/3 killed · suite 1542 files / 16,307 · Halfshell 76 → **78** across this and the Big Apple slice (7 to the bar); the shared suite run covers both

- 2026-09-05 — Phase 2 · Q4 Swift Demise (Halfshell) ✅ +1 corpus (the mass destroy learned the OPPONENT-creature scope — "destroy each creature you don't control [that was dealt damage this turn]" — the bounce family's scope on the destroy op, the dealt-damage restriction already a shared kind) · mutants 4/4 killed · suite 1540 files / 16303 · Halfshell 75 → **76** (9 to the bar); a resolution gap closed on the way — the opponent-creature sweep ignored the atom's restrictions

- 2026-09-05 — Phase 2 · Q5 Lita, Little Orphan Amphibian (Halfshell) ✅ +2 corpus (the MODE-MEMORY modal lead's PERIOD form — "choose one that hasn't been chosen this turn." then bullet lines — admitted beside the dash form at the trigger block extractor and the modal parser; the per-turn mode ledger already enforced) · mutants 5/5 killed · suite 1539 files / 16,301 · Halfshell 74 → **75** (10 to the bar); Titanium Man the unplanned gain, audited whole-card

- 2026-09-05 — Phase 2 · Q3 Casey Jones, Back Alley Brute (Halfshell) ✅ +1 corpus (the ACTIVE counters-placed event learned the damage payoff — "this creature deals that much damage to target opponent", magnitude = the counters placed — the passive Shalai-and-Hallar sentinel's twin on its own count field) · mutants 3/3 killed · suite 1538 files / 16,299 · Halfshell 73 → **74** (11 to the bar); one suite guard graduated — countersPlaced had pinned Casey Jones as body-only by name (a ridered payoff stays pinned refused)

- 2026-09-05 — Phase 2 · Q3 Ray Fillet, Wave Warrior (Halfshell) ✅ +3 corpus (the WITH-A-COUNTER dealer filter on the creature-you-control combat-damage scope — "a creature you control with a counter on it deals combat damage to a player": a live per-dealer read of any counter kind at the fire site) · mutants 4/4 killed · suite 1537 files / 16,296 · Halfshell 72 → **73** (12 to the bar); Yathan Tombguard and Venus, Torn Between Worlds the unplanned gains, audited whole-card

- 2026-09-05 — Phase 2 · Q3 Tokka & Rahzar + Splinter, the Mentor (Halfshell) ✅ +3 corpus (the NONTOKEN leaves-the-battlefield scope — "another nontoken creature you control" and the self-inclusive "<Name> or another nontoken creature you control" — a token gate on the leaving permanent beside the existing creature-leaves scopes) · mutants 4/4 killed (one survivor got its missing test) · suite 1536 files / 16,293 · Halfshell 69 → **72** (13 to the bar); Rat King, Pale Piper the unplanned gain, audited whole-card (menace + the same self-inclusive union making a Rat + a native sacrifice-a-token draw)

- 2026-09-05 — Phase 2 · F8 GIFT on spells (Bumble Flower's composite: Long River's Pull · Peerless Recycling · Wear Down — Bumble 85 → 88; Atraxa unchanged at 72, mis-attributed in the commit title) ✅ +13 corpus (the kicker precedent — "Gift a <X>" is an optional additional cost the engine never pays, so the un-promised text IS the printed base mode; the keyword line joins the cost-only strip and the "If the gift was promised, …" sentence is stripped at the spell-program site; the permanent carriers' promised triggers stay parked) · mutants 3/3 killed · suite 1535 files / 16,290 · Atraxa 72 → **75** (10 to the bar). ATRAXA CEILING REACHED for Phase 2 without the planeswalker sweep — every remaining row sizes M+ (Kiora's all-damage to-and-by shield, Arena Rector's dies-may-exile reflexive with no if-you-do machinery, Urza's Ruinous Blast's nonland-nonlegendary mass exile + the legendary-sorcery cast gate, Astral Cornucopia's count-derived colour-choice tap, Mutational Advantage's counters-scoped grant) or L (the two-plus-ability walkers, Innkeeper's Talent, Interplanar Beacon, Wedding Ring, the Oaths, Carth, Avatar's Wrath, Mechanized Production); per §2.4 those are noted in §5.9 and the §5 order moves to Halfshell (69)

- 2026-09-05 — Phase 2 · A5-adjacent Dueling Grounds (Atraxa) ✅ +3 corpus (the GLOBAL combat cap — "No more than one creature can attack / block each combat": one static read off every battlefield, the attacker and blocker enumerations stop at the cap; the defender-scoped "attack you" printings stay refused) · mutants 4/4 killed · suite 1534 files / 16,287 · Atraxa 71 → **72** (13 to the bar); Silent Arbiter and Caverns of Despair the unplanned gains, audited whole-card

- 2026-09-05 — Phase 2 · A2 Norn's Annex (Atraxa) ✅ +1 corpus (the PHYREXIAN attack tax — "{W/P} for each of those creatures": a per-attacker pip the payment plan pays with {W} when it can and with 2 life otherwise; legality mirrors the same two lanes; the life leaves through the one life-loss chokepoint) · mutants 5/5 killed · suite 1533 files / 16,282 · Atraxa 70 → **71** (14 to the bar)

- 2026-09-05 — Phase 2 · A3 Deploy the Gatewatch (Atraxa) ✅ +1 corpus (the COUNTED dig onto the battlefield — "Put up to two <type> cards from among them onto the battlefield" — the dig-to-battlefield frame with the keep count the settler already re-raises on) · mutants 5/5 killed · suite 1532 files / 16,276 · Atraxa 69 → **70** (15 to the bar); Arena Rector, Ashiok, Mutational Advantage sized in the A3 row

- 2026-09-05 — Phase 2 · A4 Teferi, Hero of Dominaria (Atraxa) ✅ +6 corpus (the POSITIONAL tuck — "into its owner's library third from the top" — a library index on the zone mover beside its top flag, clamped to the library's length; the tuck atom's third placement) · mutants 4/4 killed (one survivor deleted as dead) · suite 1531 files / 16,271 · Atraxa 68 → **69** (16 to the bar); six flips — Teferi plus Chronostutter, Isolation at Orthanc, Synchronized Eviction (the same ordinal) and Bury in Books, Oust (audited whole-card)

- 2026-09-05 — Phase 2 · A2 Oath of Gideon (Atraxa) ✅ +1 corpus (the others-enter-with static learned its planeswalker/loyalty shape — "Each planeswalker you control enters with an additional loyalty counter on it" — read by the same reader the entry site honours; the extra loyalty is added before a doubler, as the controller would order it) · mutants 4/4 killed · suite 1530 files / 16,266 · Atraxa 67 → **68** (17 to the bar)

- 2026-09-05 — Phase 2 · A2 Sphere of Safety (Atraxa) ✅ +1 corpus (the attack tax's COUNTED amount — "{X} … where X is the number of enchantments you control" — read through the shared count source and resolved against the DEFENDER's live board at every declaration; the restriction and the payment still ship together) · mutants 4/4 killed · suite 1529 files / 16,261 · Atraxa 66 → **67** (18 to the bar); one suite guard graduated — attackTaxPlaneswalkers had pinned Sphere of Safety as refused by name (the life-payment and domain refusals stay pinned)

- 2026-09-05 — Phase 2 · A4 Garruk, Unleashed (Atraxa) ✅ +1 corpus (a walker naming ITSELF as the loyalty counter's recipient — the loyalty parser rewrites the fixed-count "put a loyalty counter on <own name>" tail to the self noun; the named-counter atom lands on the loyalty key) · mutants 4/4 killed · suite 1528 files / 16,255 · Atraxa 65 → **66** (19 to the bar); Kiora and Teferi Hero sized M in the A4 row; Interplanar Beacon sized L in A2

- 2026-09-05 — Phase 2 · F6 Feasting Hobbit (Bumble Flower) ✅ +2 corpus (the TYPED devour — "Devour Food/artifact/land N" — joins the optional-mode credit on the family's own law: sacrificing zero is the printed creature; the curated type word and the digit anchor both stay closed) · mutants 3/3 killed · suite 1527 files / 16,249 · Bumble Flower 84 → **85, AT THE BAR**; Caprichrome the unplanned gain, audited whole-card (flash + vigilance + Devour artifact 1); Famished Worldsire stays parked on its own look-at-top-X ETB

- 2026-09-05 — HARDENING · the self-ETB fallback swallowed a disjoint subject ("this X OR a <filter> enters" read as a plain self-ETB, the second subject dropped — surfaced sizing Campsite Cuisine): the fallback now refuses a self reference carrying an unmodelled " or " · 2 lost (each a hollow removed: Tomebound Lich ('enters or deals combat damage to a player') and Shield Mare ('enters or becomes the target of a spell or ability an opponent controls') — each had its second, PRODUCIBLE event silently dropped; the six vacuous-event compounds (turned face up / specializes) keep their ETB by the exemption) · mutants 4/4 killed · suite 1526 files / 16,246

- 2026-09-05 — Phase 2 · F6 Sam, Loyal Attendant (Bumble Flower) ✅ +2 corpus (the activated-cost reduction's subject grew: lands, artifact tokens, a validated subtype plural — each its own descriptor and runtime gate) · mutants 5/5 killed · suite 1525 files / 16,245 · Bumble Flower 83 → **84** (1 to the bar); Blossoming Tortoise the unplanned gain (the 'lands' subject; its other lines were already required modelled by the whole-card check); one suite guard graduated — artifactActivatedCostReduction had pinned 'lands you control' as refused by name

- 2026-09-05 — Phase 2 · F5 Kwain (Bumble Flower) ✅ +1 corpus (the per-seat "may" pause grew a DRAW effect with a per-drawer life gain — the yes-seats draw through the trigger-threading path and gain through the lifegain path) · mutants 6/6 killed · suite 1524 files / 16,242 · Bumble Flower 82 → **83** (2 to the bar)

- 2026-09-05 — Phase 2 · F6 Lembas (Bumble Flower) ✅ +1 corpus (the owner-voiced "its owner shuffles it into their library" joins the shuffle-self op; the leave event and resolver already routed) · mutants 3/3 killed · suite 1523 files / 16,239 · Bumble Flower 81 → **82** (3 to the bar)

- 2026-09-05 — Phase 2 · F6 Continue? (Bumble Flower) ✅ +4 corpus (a per-card FROM-BATTLEFIELD-THIS-TURN stamp at the zone mover, an enumerator gate on it, a splitter fold + zones arm for the "choose … return …" pair with a multi-count reanimate) · mutants 7/7 killed · suite 1522 files / 16,237 · Bumble Flower 80 → **81** (4 to the bar); Othelm, Salvager of Ruin, Brought Back the unplanned gains — the same choose-then-return pair with filters the arm reads, audited from their printed text

- 2026-09-05 — HARDENING · the Flashback line strip's rider swallow (a hollow surfaced by Visions of Dominance's flip): a trailing sentence on a Flashback line is now honest to drop only when it modifies the flashback cast itself ("this way"); anything else is fenced and the card parks · zero corpus impact · mutants 3/3 killed · suite 1521 files / 16,233

- 2026-09-05 — Phase 2 · F5 Study the Classics (Bumble Flower) ✅ +5 corpus (the BOUND "double the +1/+1 counters on it" and a bound-target +1/+1 count for the life arm) · mutants 6/6 killed · suite 1520 files / 16,232 · Bumble Flower 79 → **80** (5 to the bar); four unplanned gains audited — Growth Curve, Invigorating Surge, Sage of the Fang (the same shape), Visions of Dominance (its flashback line's 'costs {X} less this way' rider modifies only a flashback cast the engine never offers — FN-safe, the same basis as the flashback strip; the line strip's swallow of ANY trailing sentence is a hollow closed in the next commit)

- 2026-09-05 — Phase 2 · F6 Samwise Gamgee (Bumble Flower) ✅ +2 corpus ("historic" joins the graveyard filter vocabulary — an artifact, a legendary, or a Saga off the front face) · mutants 4/4 killed · suite 1519 files / 16,229 · Bumble Flower 78 → **79** (6 to the bar); Layla Hassan the unplanned gain, audited whole-card (first strike + a compound ETB/combat-damage head returning a historic card); one suite guard graduated — gyRecursion had listed 'historic' as unmodelled by name

- 2026-09-05 — Phase 2 · F6 Hot Soup (Bumble Flower) ✅ +1 corpus (the EQUIPPED scope on the dealt-damage event + "destroy it" rewritten to the triggering-creature destroy sentinel) · mutants 4/4 killed (one survivor got its missing test) · suite 1518 files / 16,227 · Bumble Flower 77 → **78** (7 to the bar)

- 2026-09-05 — Phase 2 · F6 Elanor Gardner (Bumble Flower) ✅ +2 corpus (a per-player SACRIFICED-THIS-TURN memo stamped at the sacrifice chokepoint; "if you sacrificed a <Type> this turn" read word-bounded off it) · mutants 5/5 killed · suite 1517 files / 16,224 · Bumble Flower 76 → **77** (8 to the bar); Detective's Satchel the unplanned gain, audited whole-card (its activation condition 'you've sacrificed an artifact this turn' reads the new memo; investigate twice + the Thopter were already modelled)

- 2026-09-05 — Phase 2 · F6 Shoreline Looter + Night of the Sweets' Revenge (Bumble Flower) ✅ +8 corpus (the trailing rider's NEGATED connective "<effect> unless <cond>"; the keyword-less Overrun-X team pump with a count source) · mutants 6/6 killed (one survivor got its missing test) · suite 1516 files / 16,221 · Bumble Flower 74 → **76** (9 to the bar); six unplanned gains audited whole-card — Chart a Course, Chakra Meditation, The Spot's Portal, Mindwrack Demon, Bellowing Saddlebrute (all 'unless' riders on conditions the reader already accepted under 'if'), Become the Avalanche (the bare Overrun-X with cards in hand)

- 2026-09-05 — Phase 2 · F5 Wave Goodbye + Riot Control (Bumble Flower) ✅ +3 corpus (the "each creature <filter>" mass bounce + the negated named-counter form; the gain-life-for-each arm reads scoped counts + an all-damage-to-you shield) · mutants 7/7 killed · suite 1515 files / 16,217 · Bumble Flower 72 → **74** (11 to the bar); Emissary of Hope the unplanned gain, audited by RUNTIME probe (its 'that player' count reads the damaged player through the resolver's designed fallback — three artifacts, three life)

- 2026-09-05 — Phase 2 · F6 Heaped Harvest (Bumble Flower) ✅ +2 corpus (the self-sacrifice trigger head widened past auras — "when you sacrifice it"; the self-sac cost guard exempts the one trigger the cost path itself fires) · mutants 4/4 killed (after two survivors collapsed into one strip) · suite 1514 files / 16,213 · Bumble Flower 71 → **72** (13 to the bar); two suite guards graduated — selfLtbCostSac and abilities.test had pinned the exact refusal this slice inverted, the Carrot Cake pin by name

- 2026-09-05 — Phase 2 · F4 Academy Manufactor (Bumble Flower) ✅ +1 corpus (a one-of-each token-creation replacement on the doubler profile, applied per pass at the mint chokepoint; NOT re-doubled — either replacement order gives two of each beside a doubler) · mutants 7/7 killed · suite 1513 files / 16,209 · Bumble Flower 70 → **71** (14 to the bar)

- 2026-09-05 — Phase 2 · O10 Staff of the Storyteller (Otharri) ✅ +1 corpus (the batched CREATURE-token creation event — once per create event, creature tokens only; the mint tail hands the token's card to the checker) · mutants 6/6 killed · suite 1512 files / 16,206 · Otharri 84 → **85 — AT THE BAR** (the deck is done for Phase 2; the remaining rows stay ⬜ for Phase 3)

- 2026-09-05 — Phase 2 · O10 Inti (Otharri) ✅ +3 corpus (the BATCHED discard event — once per discard event, deduped in-call and across calls; the NEXT-END-STEP impulse window decided at resolution) · mutants 9/9 killed (the splitter-fold survivor became the Haste Magic pin) · suite 1511 files / 16,203 · Otharri 83 → **84** (1 to the bar); Dying to Serve the second unplanned gain, audited whole-card (batched discard → tapped Zombie, once each turn — all modelled)

- 2026-09-05 — Phase 2 · O10 Otharri's self-return (Otharri) ✅ +2 corpus (a tap-an-untapped-<X>-you-control cost component on the graveyard self-recursion arm; one legal action per eligible untapped permanent; the dispatcher re-verifies and taps) · mutants 5/5 killed · suite 1510 files / 16,197 · Otharri 82 → **83** (2 to the bar); Purple Pentapus the second carrier, audited whole-card (surveil ETB + the return, both modelled); one suite guard graduated — the O1 tapped-attacking witness had pinned Otharri body-only ON this very line

- 2026-09-05 — Phase 2 · O8 Tithe (Otharri) ✅ +1 corpus (a targeted-opponent compare rider on the hand tutor — one extra pick at resolution when the chosen opponent controls strictly more lands; the splitter folds the three printed sentences into one clause) · mutants 6/6 killed (a 7th, the intent arm, survived and was deleted as dead) · suite 1509 files / 16,193 · Otharri 81 → **82** (3 to the bar)

- 2026-09-05 — Phase 2 · O10 Reroute Systems (Otharri) ✅ +2 corpus (a keyword grant on the ARTIFACT-OR-CREATURE union — the β-2 pool carries it, the pump gate admits it beside the permanent scope; Loran's Escape rides through a splitter keep-whole) · mutants 4/4 killed · suite 1508 files / 16,189 · Otharri 80 → **81** (4 to the bar); Loran's Escape the second printed carrier, audited whole-card (union grant + scry)

- 2026-09-05 — Phase 2 · O11 Hour of Reckoning (Otharri) ✅ +1 corpus (the each-creature wipe narrowed by TOKEN-NESS — a new `token` restriction kind in the shared satisfier; convoke was already a stripped cost keyword) · mutants 5/5 killed · suite 1507 files / 16,187 · Otharri 79 → **80** (5 to the bar)

- 2026-09-05 — Phase 2 · O9 Blacksmith's Skill (Otharri) ✅ +2 corpus (a keyword grant on a target PERMANENT + a type-conditional bound pump read layer-aware at resolution; the splitter's permanent-subject keep-whole freed from "you control") · mutants 7/7 killed · suite 1506 files / 16,185 · Otharri 78 → **79** (6 to the bar); Renegade's Getaway the unplanned gain, audited whole-card (permanent grant + Servo token, both modelled)

- 2026-09-05 — Phase 2 · O6 Glimmer Lens (Otharri) ✅ +5 corpus (the equipped-creature attack trigger with a COMPANY condition, gated in the attack checker; a self-and-company arm with an optional subtype caught by the flip-diff; the attack block learned the plural "attack") · mutants 8/8 killed · suite 1505 files / 16,182 · Otharri 77 → **78** (7 to the bar)

- 2026-09-05 — Phase 2 · O7 Minas Tirith (Otharri) ✅ +1 corpus (the raid flag generalised to a count: "you attacked with N or more creatures this turn" read off the per-permanent attacked memo) · 3/3 killed · suite 1504/16178 · **Otharri 76 → 77 (needs 8)** · four decks at 85 (Killer Turts · Kinnan · Believe it! · Shalai). Next: O6 Glimmer Lens (the company condition), then O5 Anim Pakal, O9 Blacksmith's Skill, O8 Tithe.

- 2026-09-05 — Phase 2 · H13b Solitude (Shalai) ✅ +3 corpus (the OTHER-target qualifier on targeted removal + the gain-life-power controller rider; EVOKE modelled end to end — the pitch alt cost rides the cast, the entering body is stamped and its sacrifice is queued UNDER its own ETB) · 10/10 killed · suite 1503/16176 · **🏁 SHALAI 84 → 85 — AT THE BAR (85/100).** Killer Turts 85 ✅ · Kinnan 85 ✅ · Believe it! 85 ✅. Next: the §5 shelf order.

- 2026-09-05 — POD-SIM THREE · BI-5 Moon-Circuit Hacker + Satoru (Believe it!) ✅ +2 corpus (the unless-entered-this-turn rider on the optional draw-then-discard; a self-or-other batched enter watcher deduped ONCE PER BATCH with the not-cast-or-no-mana predicate off new arrival stamps; the trigger splitter learned the plural "enter") · 10/10 killed · suite 1502/16171 · **🏁 BELIEVE IT! 83 → 85 — AT THE BAR (85/100). ALL THREE POD-SIM DECKS AT 85: Killer Turts 85 · Kinnan 85 · Believe it! 85.** Shalai 84. (Full suite: the saboteur witness's Hacker guard graduated; every other file green.) Next: Colton's second order — the three decks' Arbiter leftovers to Omnath's nuance queue; then Shalai's last card.

- 2026-09-05 — POD-SIM THREE · BI-4 Flare of Malice + Contagion (Believe it!) ✅ +7 corpus (a greatest-mana-value edict over creatures and planeswalkers; PER-AXIS counter deltas so -2/-1 counters are real, the distribute arm widened to any P/T counter on any creatures with a side-aware fallback) · 10/10 killed · suite 1501/16165 · **Believe it! 81 → 83 (needs 2)** · Killer Turts 85 ✅ · Kinnan 85 ✅ · Shalai 84. (Full suite: three guards graduated — the distribute parks, Biogenic Upgrade's first sentence, and the simplified Flytrap fixture; the PRINTED Flytrap still parks on its doubling sentence and is now pinned as such.) Next: BI-5 Moon-Circuit Hacker + Satoru — the last two slots.

- 2026-09-05 — POD-SIM THREE · BI-3 Force of Despair + Sea Gate Restoration (Believe it!) ✅ +3 corpus (a mass destroy narrowed to entered-this-turn; a hand-count-plus draw; the rest-of-game no-max-hand-size rider as a FLAG atom the cleanup step reads) · 7/7 killed · suite 1500/16160 · **Believe it! 79 → 81 (needs 4)** · Killer Turts 85 ✅ · Kinnan 85 ✅ · Shalai 84. Next: BI-4 Flare of Malice + Contagion.

- 2026-09-05 — POD-SIM THREE · BI-2 Demonic Consultation + Tainted Pact (Believe it! — THE WIN) ✅ +3 corpus (the name choice through the tutor pause in consultation mode; a new take-or-continue chained pause for the Pact, wired server + driver + hook + panel; neither is a search) · 11/11 killed · suite 1499/16156 · **Believe it! 77 → 79 (needs 6)** — the win is playable end to end. Killer Turts 85 ✅ · Kinnan 85 ✅ · Shalai 84. Next: BI-3 Force of Despair + Sea Gate Restoration.

- 2026-09-05 — POD-SIM THREE · KN-5b Wan Shi Tong (Kinnan) ✅ +2 corpus (the cast lane enumerates X for an X-reading ETB; "put X counters" + "draw half X rounded down" off the context's X; a LIBRARY-SEARCH event from the two tutor sites only) · 7/8 killed + 1 documented survivor · suite 1498/16148 · **🏁 KINNAN 84 → 85 — AT THE BAR (85/100), the second of the pod-sim three.** Believe it! 77 (needs 8) · Killer Turts 85 ✅ · Shalai 84. (Full suite: the half-X witness parked Wan Shi Tong on the undetected search trigger — graduated; every other file green.) Next: RUNBOOK-BELIEVE-IT BI-2 Demonic Consultation + Tainted Pact — THE WIN.

- 2026-09-05 — POD-SIM THREE · KN-6a Sink into Stupor (Kinnan) ✅ +1 corpus (the Venser stack-or-battlefield bounce narrowed to an opponent's spell / an opponent's nonland permanent — the modal card's only park; the land back was whole) · 5/5 killed · suite 1497/16143 · **Kinnan 83 → 84 (needs 1)** · Believe it! 76 · Killer Turts 85 ✅ · Shalai 84. (Full suite: the modal-land witness used Sink into Stupor as its 'unmodeled front' example — two tier guards graduated and its cast test rewritten into a positive pin; every other file green.) Next: KN-5b Wan Shi Tong — the last slot.

- 2026-09-05 — POD-SIM THREE · KN-4 Treasure Vault + Moonsilver Key + Cephalid Coliseum (Kinnan) ✅ +7 corpus (a {X}{X} activation cost owing 2X + bare "Create X Treasures"; the artifact-with-a-mana-ability tutor filter; threshold "N or more cards in your graveyard" + one draw-then-discard atom for the same player) · 8/8 killed · suite 1496/16140 · **Kinnan 80 → 83 (needs 2)** · Believe it! 76 · Killer Turts 85 ✅ · Shalai 84. (Full suite: three pre-existing guards asserted the double-X cost and the draw-then-discard sentence UNMODELED — graduated and re-run green; every other file green.) Next: KN-5/6 — the last two slots.

- 2026-09-05 — POD-SIM THREE · KN-3 Flash Photography + Imposter Mech (Kinnan) ✅ +3 corpus (a token copy of target PERMANENT, Auras/Sagas never targets; the opponent-creature clone scope + a become-Vehicle rider with Crew N) · 11/11 killed · suite 1495/16136 · **Kinnan 78 → 80 (needs 5)** · Believe it! 76 · Killer Turts 85 ✅ · Shalai 84. Next: KN-4 Treasure Vault · Moonsilver Key · Cephalid Coliseum.

- 2026-09-05 — POD-SIM THREE · KN-2 Clever Impersonator + Copy Enchantment (Kinnan) ✅ +2 corpus (the native-clone family widened to "any nonland permanent" / "any enchantment"; a copied anthem APPLIES; Auras + Sagas never offered) · 6/6 killed · suite 1494/16129 · **Kinnan 76 → 78 (needs 7)** · Believe it! 76 · Killer Turts 85 ✅ · Shalai 84. Next: KN-3 Flash Photography + Imposter Mech. (Full suite: one pre-existing clone guard asserted the enchantment scope PARKED — graduated to native and re-run green; every other file green.)

- 2026-09-05 — POD-SIM THREE · KN-1 Thassa's Oracle (Kinnan + Believe it!) ✅ +1 corpus (one devotion-dig-win atom: X = LIVE devotion at resolution, win if X ≥ library, else the impulse-dig pause with a TOP destination + decline) · 8/8 killed · suite 1493/16,124 · **Kinnan 75 → 76 (needs 9) · Believe it! 75 → 76 (needs 9)** — Thoracle native in both. Killer Turts 85 ✅ · Shalai 84. Next: KN-2 Clever Impersonator + Copy Enchantment (clone scope widening).

- 2026-09-05 — POD-SIM THREE · KT-9b Not of This World (Killer Turts) ✅ +3 corpus (the spell-OR-ability counter union with the targets-what predicate + a TARGET-CONDITIONAL cost reduction settled per chosen target; twins Diplomatic Escort, Siren Stormtamer) · 8/8 killed · suite 1492/16,117 · **Killer Turts 84 → 85 — AT THE BAR (85/100), the first of the pod-sim three.** Kinnan 75 · Believe it! 75 · Shalai 84 (Solitude). Next: Kinnan per RUNBOOK-KINNAN (KN-1 Thassa's Oracle).

- 2026-09-05 — POD-SIM THREE · KT-10a Carpet of Flowers (Killer Turts) ✅ +8 corpus · 9/9 killed (the engine-hook mutant survived once → a stepping pin added → killed) · suite 1491 files / 16,110 tests · corpus 14,452 (42.2%) · shelf refreshed in §1 · CI: BLOCKED (repo private → billing); LOCAL on the full gates.

- 2026-09-05 — POD-SIM THREE · KT-7b Full Throttle (Killer Turts) ✅ +1 corpus · 9/9 killed + 1 dead-code deletion (a re-entry drain the step-actions drain already covered); the 08 extraCombatAtom pin on the counted grant GRADUATED · suite 1490 files / 16,106 tests · corpus 14,444 (42.2%) · shelf refreshed in §1 · CI: BLOCKED (repo private → billing); LOCAL on the full gates.

- 2026-09-05 — POD-SIM THREE · KT-9a Avoid Fate (Killer Turts) ✅ +2 corpus · 4/4 killed + 1 EQUIVALENT documented (the resolution-side mirror line: unknown filters are permissive there by design) · suite 1489 files / 16,104 tests · corpus 14,443 (42.2%) · shelf refreshed in §1 · CI: BLOCKED (repo private → billing); LOCAL on the full gates.

- 2026-09-05 — POD-SIM THREE · KT-8 Grim Reaper's Sprint (Killer Turts) ✅ +3 corpus · 6/6 killed · suite 1488 files / 16,101 tests · corpus 14,441 (42.2%) · shelf refreshed in §1 · CI: BLOCKED (repo private → billing); LOCAL on the full gates.

- 2026-09-05 — POD-SIM THREE · KT-7a Overpowering Attack (Killer Turts) ✅ +1 corpus · 7/7 killed · suite 1487 files / 16,098 tests · corpus 14,438 (42.2%) · shelf refreshed in §1 · CI: BLOCKED (repo private → billing); LOCAL on the full gates.

- 2026-09-05 — POD-SIM THREE · KT-6 Savage Beating (Killer Turts) ✅ +1 corpus · 6/6 killed · suite 1486 files / 16,095 tests · corpus 14,437 (42.2%) · shelf refreshed in §1 · CI: BLOCKED (repo private → billing); LOCAL on the full gates.

- 2026-09-05 — POD-SIM THREE · KT-4b Open the Omenpaths (Killer Turts) ✅ +1 corpus · 5/5 killed · suite 1485 files / 16,092 tests · corpus 14,436 (42.2%) · shelf refreshed in §1 · CI: BLOCKED (repo private → billing); LOCAL on the full gates.

- 2026-09-05 — POD-SIM THREE · KT-5 City of Traitors (Killer Turts) ✅ +1 corpus · 7/7 killed · suite 1484 files / 16,089 tests · corpus 14,435 (42.2%) · shelf refreshed in §1 · CI: BLOCKED (repo private → billing); LOCAL on the full gates.

- 2026-09-05 — POD-SIM THREE · KT-4a Geosurge (Killer Turts) ✅ +2 corpus · 6/6 killed · suite 1483 files / 16,085 tests · corpus 14,434 (42.1%) · shelf refreshed in §1 · CI: BLOCKED (repo private → billing); LOCAL on the full gates.

- 2026-09-05 — POD-SIM THREE · KT-3 Irencrag Feat + Rite of Flame (Killer Turts) ✅ +3 corpus · 10/10 killed · suite 1482 files / 16,083 tests · corpus 14,432 (42.1%) · shelf refreshed in §1 · CI: BLOCKED (repo private → billing); LOCAL on the full gates.

- 2026-09-05 — POD-SIM THREE · KT-2 Guttural Response + Pyroblast (Killer Turts; Hydroblast twin) ✅ +3 corpus · 5/5 killed; the 08 CREED pin on Pyroblast GRADUATED (repointed: native + the colour survives on both modes) · suite 1481 files / 16,079 tests · corpus 14,429 (42.1%) · shelf refreshed in §1 · CI: BLOCKED — repo PRIVATE again (billing); KT-1 cf939cef's run died in 2 s with zero steps; pushes HOLD, this slice is LOCAL on the full gates.

- 2026-09-05 — POD-SIM THREE · KT-1 Port Razer (Killer Turts) ✅ +1 corpus · 7/7 killed · suite 1480 files / 16,075 tests · corpus 14,426 (42.1%) · shelf refreshed in §1 · CI: GREEN on the runbooks push (run 33931510748); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · H12 Chaos Warp (Shalai; Nekusar N13 shared) ✅ +1 corpus · 6/6 killed (two survivors on the mixed library killed by a seed-driven pin: the shuffle is real, the permanent gate holds) · suite 1479 files / 16,071 tests · corpus 14,425 (42.1%) · shelf refreshed in §1 · CI: GREEN on Kami (run 33930303799); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · H13 Kami of Celebration (Shalai) ✅ +1 corpus · 7/7 killed · suite 1478 files / 16,066 tests · corpus 14,424 (42.1%) · shelf refreshed in §1 · H13 sized card by card · CI: GREEN on Uncivil Unrest + Kutzil (run 33929591693); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · H11 Uncivil Unrest + Kutzil (Shalai) ✅ +2 corpus · 8/8 killed · suite 1477 files / 16,063 tests · corpus 14,423 (42.1%) · shelf refreshed in §1 · CI: GREEN on Arwen (run 33928602768); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · H8 Arwen (Shalai; Bramblewood Paragon twin) ✅ +2 corpus · 8/8 killed (M4 survived → dead self-guard REMOVED with its parameter) · suite 1476 files / 16,058 tests · corpus 14,421 (42.1%) · shelf refreshed in §1 · H4 Ragavan re-sized L · CI: GREEN on Hajar + Spider-Man (run 33927431530); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · H10 + H7 Hajar + Spider-Man (Shalai) ✅ +2 corpus · 7/7 killed (M8 equivalent — no filtered other-spray parses; deleted with a note, FN pinned) · suite 1475 files / 16,053 tests · corpus 14,419 (42.1%) · shelf refreshed in §1 · CI: GREEN on Yoshimaru + Krenko (run 33926593975); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · H6 + H5 Yoshimaru + Krenko (Shalai; five twins) ✅ +7 corpus · 8/8 killed (M9/M10 deleted with dead code; M11 equivalent) · suite 1474 files / 16,048 tests · corpus 14,417 (42.1%) · shelf refreshed in §1 · CI: GREEN on Damning Verdict (run 33925136431); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · H9 Damning Verdict (Shalai) ✅ +1 corpus · 5/5 killed · suite 1473 files / 16,040 tests · corpus 14,410 (42.1%) · shelf refreshed in §1 · CI: GREEN on Step Between Worlds (run 33924122267); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · K9 Step Between Worlds (Kellan) ✅ +1 corpus · 9/9 killed (a tenth — removing the side-sheet panel mount — was EQUIVALENT: LearnView renders the panel by two paths; deleted, documented) · suite 1472 files / 16,036 tests · corpus 14,409 (42.1%) · **Kellan reaches 85** · shelf refreshed in §1 · CI: GREEN on Ellie and Alan (run 33922826480); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · K8 Ellie and Alan, Paleontologists (Kellan) ✅ +1 corpus · 4/4 killed · suite 1471 files / 16,030 tests · corpus 14,408 (42.1%) · Mind's Dilation PARKED · shelf refreshed in §1 · CI: run 33921961492 (Rashmi) in flight at commit time — this slice pushes only after it reads green.

- 2026-09-04 — Phase 2 · K5 Rashmi, Eternities Crafter (Kellan) ✅ +1 corpus · 6/6 killed · suite 1470 files / 16,025 tests · corpus 14,407 (42.1%) · shelf refreshed in §1 · CI: GREEN on Mystic Forge (run 33920973171); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · K9 Mystic Forge (Kellan; Precognition Field twin) ✅ +2 corpus · 6/6 killed · suite 1469 files / 16,021 tests · corpus 14,406 (42.1%) · shelf refreshed in §1 · CI: GREEN on The Key to the Vault (run 33919910199); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · K8 The Key to the Vault (Kellan) ✅ +1 corpus · 6/6 killed · suite 1468 files / 16,016 tests · corpus 14,404 (42.1%) · shelf refreshed in §1 · CI: GREEN on Fblthp (run 33919024622); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · K9 Fblthp, the Lost (Kellan; four twins) ✅ +5 corpus · 11/11 killed · suite 1467 files / 16,012 tests · corpus 14,403 (42.1%) · shelf refreshed in §1 · CI: GREEN on Make Your Own Luck (run 33916625282); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · K7 Make Your Own Luck (Kellan) ✅ +1 corpus · 7/7 killed (the seventh — the pause store's chosenTo whitelist — was found by the witness, not reasoning: the store silently dropped the new destination) · suite 1466 files / 16,006 tests · corpus 14,398 (42.0%) · shelf refreshed in §1 · CI: GREEN on Doc Aurlock (run 33915685633); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · K9 Doc Aurlock (Kellan) ✅ +1 corpus · 6/6 killed · suite 1465 files / 16,002 tests · corpus 14,397 (42.0%) · shelf refreshed in §1 · CI: run 33914892283 (Savvy Trader) still in flight at commit time — this slice pushes only after it reads green.

- 2026-09-04 — Phase 2 · K9 Savvy Trader (Kellan; Sage of the Beyond twin) ✅ +2 corpus · 7/7 killed (M7 — the call sites dropping the zone — SURVIVED the first pass: the witness had pinned the reducer through a direct call, not the OFFER; a one-Forest offer pin was added and it died) · suite 1464 files / 15,996 tests · corpus 14,396 (42.0%) · shelf refreshed in §1 · CI: GREEN — run 33913617192 on cc1d1b0b (Lock and Load); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · K9 Lock and Load (Kellan) ✅ +1 corpus · 6/6 killed · suite 1463 files / 15,991 tests · corpus 14,394 (42.0%) · shelf refreshed in §1 · CI: GREEN — run 33912553233 on 7fa0e8bf (Recurring Insight); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · K9 Recurring Insight (Kellan) ✅ +1 corpus · 3/3 killed (a fourth — widen the subject to 'your hand' — was an EQUIVALENT mutant: the older cardsInHand arm claims that sentence first; deleted and documented in the witness) · suite 1462 files / 15,987 tests · corpus 14,393 (42.0%) · shelf refreshed in §1 · CI: GREEN — run 33911568285 on 210fd2f6 (Planar Nexus); this slice pushes and is watched.

- 2026-09-04 — Phase 2 · K8 Planar Nexus (Kellan) ✅ +1 corpus · 4/4 killed · suite 1461 files / 15,982 tests · corpus 14,392 (42.0%) · shelf refreshed in §1 · CI: GREEN — run 33910357246 on d17452a1 (the 42-commit stack; both shards, 11 steps each) after Colton made the repo PUBLIC; per-slice push + watch resumes.

- 2026-09-04 — Phase 2 · S17 Padeem, Consul of Innovation (Shorikai; Leonin Abunas twin) ✅ +2 corpus · 7/7 killed · suite 1460 files / 15,977 tests · corpus 14,391 (42.0%) · **Shorikai reaches 85** · shelf refreshed in §1 · CI: UNBLOCKED — Colton made the repo PUBLIC (09-04, his order; Actions minutes unmetered on public repos; write access unchanged: Robak503 only). The held stack (42 commits) pushes with this commit; CI watched after..

- 2026-09-04 — Phase 2 · S17 Kotori, Pilot Prodigy (Shorikai) ✅ +1 corpus · 6/6 killed · suite 1459 files / 15,971 tests · corpus 14,389 (42.0%) · shelf refreshed in §1 · CI: HELD — the month's Actions minutes are spent (Colton's screenshot, 09-04: 2,000/2,000, $0 budget); one push when the cycle resets.

- 2026-09-04 — Phase 2 · S17 Plaza of Heroes (Shorikai; Shizo / Shinka / Untaidake / Daily Bugle Building / Great Hall of the Citadel audited) ✅ +6 corpus · 8/8 killed · suite 1458 files / 15,965 tests · corpus 14,388 (42.0%) · shelf refreshed in §1 · CI: HELD — GitHub Actions minutes for the month are exhausted (Colton, 09-04: pushes triggered runs until the quota died); resets with the billing month — build on local gates, push the stack once.

- 2026-09-04 — Phase 2 · S17 Mech Hangar (Shorikai; the composite sized) ✅ +1 corpus · 4/4 · suite manaModel.js ("pilot" spend word + the fixed-type restricted any-colour extra line) + effects/atoms/combat.js (unscoped Vehicle animate) + mechHangar.test.js (4) · corpus 14,382 (42.0%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · S11 (Permission Denied — Shorikai; Ranger-Captain of Eos audited) ✅ +2 corpus · 5/5 · suite effects/atoms/misc.js (opponents-cast-lock-turn arm + applier) + legalChoices.js (the turn-stamped cast gate) + permissionDenied.test.js (4); one CREED pin graduated (triggerTierPins) · corpus 14,381 (42.0%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · S7 (Mobilizer Mech — Shorikai) ✅ +1 corpus · 4/4 · suite triggers.js (becomesCrewed detector arm + checkBecomesCrewedTriggers) + actionDispatcher.js (fired from the crew dispatch) + effects/atoms/combat.js (up-to-one-other Vehicle animate) + mobilizerMech.test.js (5) · corpus 14,379 (42.0%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · S5 (Prodigy's Prototype — Shorikai) ✅ +1 corpus · 3/3 · suite triggers.js (subtype-gated batch attack: detector arm, descriptor assembly, fire-site gate) + prodigysPrototype.test.js (6) · corpus 14,378 (42.0%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · S8 (Shorikai, Genesis Engine — the COMMANDER) ✅ +1 corpus · 4/4 · suite effects/parseHelpers.js (parseTokenStaticAbility) + effects/atoms/tokens.js (third quoted gate) + effects/abilities.js (crewPowerBonus) + legalChoices.js / actionDispatcher.js (the boost at both crew sites) + shorikaiGenesisEngine.test.js (4) · corpus 14,377 (42.0%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · S6 + S16 (Peacewalker Colossus / Dispatch — Shorikai) ✅ +2 corpus · 6/6 · suite effects/parser.js (additive targeted conditional) + effects/atoms/removal.js (sentinel exile/destroy) + effects/atoms/combat.js (Vehicle animate + keepPrintedPt) + spellEffects.js (vehicle pool; source exclusion on permanent pools) + shorikaiS6S16.test.js (8) · corpus 14,376 (42.0%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · S3 + S4 + S10 (Thunderhawk Gunship / Parhelion II / Surgehacker Mech — Shorikai; Leonin Warleader + Jet audited) ✅ +5 corpus · 7/7 · suite effects/atoms/combat.js (own-side attacker batch) + effects/atoms/tokens.js (attacking rider) + effects/atoms/stack.js (twice-the-count damage, opponent scope) + effects/parseHelpers.js (Vehicle count) + shorikaiSRows.test.js (8); four CREED pins graduated (teamPump / teamPumpScope / parser.test ×2) · corpus 14,374 (42.0%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · N12 (Teferi's Puzzle Box — Nekusar) ✅ +1 corpus · 5/5 · suite effects/splitClauses.js (keep-whole) + effects/atoms/hand.js (hand-to-bottom-draw-same arm + applier; wheel draws through applyDrawEffect) + teferisPuzzleBox.test.js (6) · corpus 14,369 (42.0%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · N11 (Peer into the Abyss — Nekusar) ✅ +1 corpus · 5/5 · suite effects/templateMatchers.js (matcher) + effects/parser.js (dispatch) + effects/atoms/misc.js (applier) + effects/programQueries.js (enemy intent) + peerIntoTheAbyss.test.js (6) · corpus 14,368 (42.0%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · N6 + N7 (Painful Quandary / Phyrexian Tyranny — Nekusar; Isolation Cell audited) ✅ +3 corpus · 6/6 · suite effects/templateMatchers.js (two matchers) + effects/parser.js (dispatch) + effects/atoms/stack.js (two appliers) + pendingChoice.js (declineAmount / declineLoseLife) + effects/runProgram.js (the two decline branches) + effects/effectAtoms.js (ops) + nekusarUnless.test.js (7) · corpus 14,367 (42.0%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · N10 (Dark Deal + Incendiary Command — Nekusar; Wheel and Deal parked) ✅ +2 corpus · 5/5 · suite effects/splitClauses.js (keep-whole) + effects/atoms/hand.js (each-player wheel-by-count arm + applier) + darkDeal.test.js (5) · corpus 14,364 (41.9%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · N4 + N5 + N8 (Sheoldred / Forced Fruition / Bedevil — Nekusar; N9 closed by T1c) ✅ +3 corpus · 6/6 · suite triggers.js (card-drawn pronoun referent) + effects/atoms/misc.js (casting-player draw) + effects/atoms/removal.js (three-type destroy) + effects/programQueries.js (flush-gate list) + spellEffects.js (note) + nekusarSRows.test.js (8) · corpus 14,362 (41.9%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · B4 (Reflector Mage — Brago) ✅ +1 corpus · 7/7 · suite effects/splitClauses.js (sentinel fold) + effects/atoms/zones.js (name-lock bounce arm + applier) + gameState.js (nameCastLocked / expireNameCastLocks) + legalChoices.js (cast gate) + gameEngine.js (untap-step expiry) + reflectorMage.test.js (6) · corpus 14,359 (41.9%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · B12 (Cryogen Relic — Brago) ✅ +1 corpus · 5/5 · suite effects/atoms/counters.js (bare stun arm) + effects/programQueries.js (stun = enemy intent) + cryogenRelic.test.js (6); one CREED pin graduated (stunCounterCount) · corpus 14,358 (41.9%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · B8 (Loran of the Third Path — Brago) ✅ +3 corpus · 5/5 · suite effects/atoms/misc.js (two-seat draw arm + applier branch) + effects/splitClauses.js (keep-whole guard) + loranOfTheThirdPath.test.js (6) · corpus 14,357 (41.9%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · B7 (Unquestioned Authority — Brago) ✅ +3 corpus · 8/8 · suite protection.js (parseProtectionClasses) + layers.js (permanentProtectionClasses) + staticAbilityParser.js (Aura/Equipment class grant) + spellEffects.js (creature-sourced targeting) + combatEvasion.js (block) + combatResolution.js (damage) + protectionFromCreatures.test.js (7); one CREED pin graduated (runemarkConditionalKeyword) · corpus 14,354 (41.9%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · B6 (Teleportation Circle — Brago) ✅ +2 corpus · 5/5 · suite effects/atoms/zones.js (artifact-or-creature blink arm) + spellEffects.js (artifactOrCreatureYouControl enumerator) + effects/splitClauses.js (keep-whole guard) + teleportationCircle.test.js (8) · corpus 14,351 (41.9%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · B5 (Recruiter of the Guard — Brago) ✅ +2 corpus · 4/4 · suite effects/atoms/library.js (tutor-to-hand stat cap + the shared matcher's printed-stat gate) + recruiterOfTheGuard.test.js (6) · corpus 14,349 (41.9%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · T8 (Tolaria West — Teval) ✅ +1 corpus · 5/5 · suite effects/abilities.js (transmute arm + printedManaValue) + coverage.js (line regex) + legalChoices.js (sorcery-only stack gate) + tolariaWest.test.js (9) · corpus 14,347 (41.9%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · T7 (Tasigur, the Golden Fang — Teval) ✅ +1 corpus · 5/5 · suite spellEffects.js ("nonland" graveyard filter) + effects/atoms/zones.js (opponent's-choice pick) + pendingChoice.js / effects/runProgram.js (milled-pick `owner` seat) + learnSession.js ("Give" label) + tasigur.test.js (8) · corpus 14,346 (41.9%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6; a rerun at 15:22Z died in 4s with 0 steps); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · T6 (Demolition Field — Teval) ✅ +1 corpus · 2/2 · suite effects/spanMatchers.js (matchRemovalControllerRider admits the possessive subject "that <noun>'s controller") + demolitionField.test.js (5) · corpus 14,345 (41.9%) · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · T4 (Titania, Protector of Argoth — Teval) ✅ +1 corpus · 4/4 mutations killed against a green witness (the subject arm removed, the graveyard-exit gate removed, the controller gate removed, the type gate removed) · suite 1436 files / 15,830 tests · corpus 14,344 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · T1c (Boggart Trawler — Teval) ✅ +5 corpus · 2/2 mutations killed against a green witness (the intent case removed — ambiguous again; the side flipped to own) · suite 1435 files / 15,824 tests · corpus 14,343 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — Phase 2 · T3 (Field of the Dead — Teval) ✅ +1 corpus · 4/4 mutations killed against a green witness (the arm removed, lands counted instead of names, non-lands counted, the threshold off by one) · suite 1434 files / 15,820 tests · corpus 14,338 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — V15 (the Light-Paws Auras) ✅ +10 corpus · Phase 1 vein rows complete · 6/6 mutations killed against a green witness (the Aura noun removed from the detain frame, the attach arm removed, the pool restricted to own creatures, the resolver keeping Equip's own-creature rule, the validator refusing the attach line, the current host offered as a move) · suite 1433 files / 15,813 tests · corpus 14,337 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — V14 (Gingerbrute / Tough Cookie) ✅ +4 corpus · 6/6 mutations killed against a green witness (the except-by arm removed, the grant collapsing to flat unblockable, the block-time read removed, the artifact animate arm removed, the controller restriction dropped, the printed power ignored) · suite 1432 files / 15,807 tests · corpus 14,327 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — V13 (Maze of Ith) ✅ +3 corpus · 8/8 mutations killed against a green witness (the fold, the keep-together rule, the arm, the stamps, the dealer half, both receiver gates — the blocker-side one pinned on a stamped blocker directly — and the AI's enemy-facing read) · suite 1431 files / 15,801 tests · corpus 14,323 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — V12 (the extra-turn trio) ✅ +4 corpus · 8/8 mutations killed against a green witness (the timing word removed, 'that turn' read as 'any', the stamp never set, the stamp surviving rotation, the drain ignoring the stamp, 'you lose the game' unparsed, the controller never flagged, the AI guard removed) · suite 1430 files / 15,790 tests · corpus 14,320 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — V11 (Path of Ancestry) ✅ +1 corpus · 7/7 mutations killed against a green witness (the rider never parsing, the planner projection dropping it, the type-sharing check ignored, the detector arm removed, the tap record dropping it, the command zone ignored, the creature-spell gate removed — pinned on a Kindred instant) · suite 1429 files / 15,783 tests · corpus 14,316 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — V10 (Scythecat Cub) ✅ +5 corpus · 7/7 mutations killed against a green witness (the ledger never bumping, 'second' read as 'at least once', the key not stamped, the key not threaded into the branch evaluator, the sentinel arm removed, the branch node carrying no target, the chooser seeing the conditional as ambiguous) · suite 1428 files / 15,774 tests · corpus 14,315 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — V9 (Valley Floodcaller) ✅ +1 corpus · 6/6 mutations killed against a green witness (the fold removed, the keep-together rule removed, the untap not stamped, the curated-word gate removed, Frog/Otter removed, the tokenizer regressed) · suite 1427 files / 15,766 tests · corpus 14,310 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — V8 (Arcade Cabinet) ✅ +5 corpus · 5/5 mutations killed against a green witness (token removed from the sacrifice types, the token branch matching any permanent, the doubler arm removed, the resolver doubling +1/+1 only, the resolver adding one instead of the current amount) · suite 1426 files / 15,760 tests · corpus 14,309 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — V7 (Rosie Cotton) ✅ +1 corpus · 4/4 mutations killed against a green witness (the nickname candidate removed, the other-than rewrite arm removed, the counter arm's new form removed, the exclusion dropped) · suite 1425 files / 15,753 tests · corpus 14,304 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — V6 slice 2 (Kirol — the counted tap cost) ✅ +12 corpus · V6 done (+15) · 8/8 mutations killed against a green witness (the counted arm removed, the auto-pick freezing one body, the dispatcher not tapping the set, offer and dispatcher each counting the tappers as mana, the AI skip removed, the {T} source in its own set, the too-few check removed) · suite 1424 files / 15,746 tests · corpus 14,303 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — V6 slice 1 (Camera + Resonator) ✅ +3 corpus · 7/7 mutations killed against a green witness (the parser arm disabled, the pool's controller and kind filters dropped, the stack window removed, the resolver copying nothing, the target spec dropping the printed kinds, the copy keeping the original's id) · suite 1423 files / 15,733 tests · corpus 14,291 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — V5 (Proft's Eidetic Memory) ✅ +2 corpus · 5/5 mutations killed against a green witness (the intervening-if arm removed and loosened to one draw, the count source removed, the reader and the parser each dropping the printed minus) · suite 1422 files / 15,721 tests · corpus 14,288 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — V4 (Orcish Bowmasters) ✅ +3 corpus · the compound-split rider FP closed (Flaring Cinder, Giott) · 6/6 mutations killed against a green witness (the then/if tail dropped from the split, the arm removed, the flag dropped at descriptor assembly, the filter ignoring the flag, the draw step not stamping, the at-the-beginning tail dropped) · suite 1421 files / 15,711 tests · corpus 14,286 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — V3 (Minamo) ✅ +2 corpus · 4/4 mutations killed against a green witness (the lane removed from the anchor, the restriction not emitted, the wrong supertype, the evaluator's type-line test removed) · suite 1420 files / 15,700 tests · corpus 14,283 · shelf refreshed in §1 · CI: HELD — GitHub billing blocks every run (plan §6); pushed with the stack once a run can start.

- 2026-09-04 — V2 (Starting Town) ✅ +1 corpus · 7/7 mutations killed against a green witness (the turn counter never stamped, the predicate inverted and removed, the extra-line regex refusing pay-life again, the extra record's payLife and its life gate, the honest-main pay-life clause) · suite 1419 files / 15,692 tests · corpus 14,281 · shelf refreshed in §1.

- 2026-09-04 — V1 slice 3 (permanent fronts) ✅ +9 corpus · V1 complete (+38) · 13/13 mutations killed against a green witness (the twelve before plus the cast's printedCard thread and the classifier's permanent-front back check); a fourteenth — a Land-front cast skip — survived and was deleted as unobservable · suite 1418 files / 15,682 tests · corpus 14,280 · shelf refreshed in §1.

- 2026-09-04 — V1 slice 2 (spell//land fronts) ✅ +19 corpus · 11/11 mutations killed against a green witness (the eight of slice 1 plus the front lane, the combined-card exclusion, the classifier's back check) · suite 1418 files / 15,680 tests · corpus 14,271 · shelf refreshed in §1.

- 2026-09-04 — V1 slice 1 (the Pathways) ✅ +10 corpus · 8/8 mutations killed (the layout gate, the per-face branch, the dispatcher's face, the printedCard restore, the classifier's both-faces gate, isLand's front face, the land gate's front face, the saved-deck layout backfill) · suite 1418 files / 15,677 tests · corpus 14,252 · shelf refreshed in §1.

- 2026-09-04 06:40Z — runbook written (Cindy). Baseline: 14 decks below 85, 233 slots. Last engine slice before it: ④-BE (Earth Bent → 90).
