# THE SHELF COMPLETION PLAN — every deck to 90 (or a called ceiling)

> **THE ONE DOCUMENT ANY CHAT CAN BOOT FROM AND EXECUTE.** Colton's standing order: grind every deck
> to ≥90% native coverage, non-stop, and call the honest ceiling per deck when the residue is
> genuinely unbuildable-class. This file holds the whole remaining arc: the boot ritual, the
> discipline, the ordered queue, every deck's residue map, and the cross-deck veins that pay in
> multiple decks at once. Update statuses IN PLACE as slices land. (Written 2026-08-15 late;
> census: 28 decks — 13 at the bar, 15 below, whole-shelf aggregate 81%.)

## 0. BOOT RITUAL (a fresh chat starts here, inside a minute)

1. Read this file + the top block of [WAKE-REPORT.md](WAKE-REPORT.md) (the live %s beat this file's).
2. Every engine/measure command runs from `app/` with
   `MTG_APP_ROOT="C:\Users\colto\AppData\Roaming\com.colton.mtg-tool"`.
3. Per-deck gate: `node scripts/measure-coverage.mjs "<deck name>"`. Corpus flip-diff:
   `node scripts/tier-snapshot.mjs --out=<file>` / `--diff=<before>,<after>` — if no session
   baseline exists yet, take one BEFORE the first edit.
4. Pick the TOP un-✅'d deck in §3's queue, then its FIRST un-✅'d slice. Before building anything,
   check §4 (the cross-deck veins) — if the card sits in a vein, build the vein's shared machinery.
5. Ship each slice through §2 in full, push, confirm CI green (`gh run list --branch master`)
   before the next push. ONE gate run at a time.

## 1. DEFINITION OF DONE

Every deck in §3 either **≥90%** on measure-coverage OR carries an explicit **CEILING call** written
into its section (what's left, why it's unbuildable-class, Colton notified). Releases batch ~100
cards per tag (the running batch count lives at the top of RUN-LEDGER.md; slices push to master
individually). When the LAST deck clears, tell Colton the shelf is at its max and give the final
table with any ceiling residue.

## 2. THE PER-SLICE DISCIPLINE (never skip a step)

probe (print the FULL oracle + which line blocks — today's lesson: HALF the "gaps" turn out to be
one missing arm on machinery that already exists, so probe before building) → build the smallest
honest arm → flip-diff by tier snapshot (audit EVERY gained rider whole-card; a LOST line is the
whole point) → witness file with seen-to-fail controls → per-process mutations (`false &&` each new
arm, verify the named test dies, restore) → ONE sequential lint+full-suite with UNPIPED exit codes
(`npx vitest run > "$TEMP/suite.txt" 2>&1; echo "TEST_EXIT=$?"`) → RUN-LEDGER + CHANGELOG entries →
measure the deck(s), update this file + the wake report → commit, push, CI green before the next
push. Old MUST-STAY-LOW pins that flip are GRADUATED with the date + a surviving guard-class
control (three graduated today — expect more; the full suite is the graduation detector).
THE CREED: false-negative SAFE, false-positive FORBIDDEN. The named traps: the hollow credit (a
modeled line the runtime never exercises), the piped exit code, the decline-only AI shortcut.
**+ THE COMMS FEED (Colton, 08-16):** when a slice PARKS a card (a probe that stays body-only, a
CREED park, a named ceiling), drop a terse line in the vault's COMMS.md naming it + the blocker —
Omnath owns the Arbiter play-nuance backfill (the `note` field on `parked:true` entries in
card-play-hints.json) and works from that feed. Flips need no line; they shrink his list natively.

## 3. THE QUEUE (Colton's order — cEDH LAST; Atraxa last of the gap decks)

| # | Deck | % | Status |
|---|------|---|--------|
| ① | Wolverine, claws out! | 83 | **ACTIVE** — 4 slices shipped today (§5.1) |
| ② | Kellan of the west | 74 | queued (§5.2) |
| ③ | Otharri Test | 74 | queued (§5.3) |
| ④ | Captain America Shoot your Shot | 73 | queued (§5.4) |
| ⑤ | Halfshell heroes | 67 | queued (§5.5) |
| ⑥ | Shalai and Hallar Test | 69 | queued (§5.6) |
| ⑦ | Thrun Voltron | 81 | gap-deck (§5.7) |
| ⑧ | Brago Blink | 75 | gap-deck (§5.8) |
| ⑨ | Shorikai Vehicles | 73 | gap-deck (§5.9) |
| ⑩ | Nekusar Wheels | 71 | gap-deck (§5.10) |
| ⑪ | Bumble Flower Combo | 62 | gap-deck (§5.11) |
| ⑫ | Light-Paws Voltron | 58 | gap-deck (§5.12) |
| ⑬ | Atraxa Superfriends | 62 | gap-deck, LAST of the seven (§5.13 — walker modeling is its own program) |
| ⑭ | Believe it! | 79 | **cEDH — LAST** (§5.14) |
| ⑮ | Kinnan Mana Overload | 77 | **cEDH — LAST** (§5.15) |
| ⑯ | Killer Turts | 65 | NEW 08-16 — Colton's Raph & Mikey deck (Archidekt 25074367, his profile); slot after the gap decks, before cEDH. The commander is ALREADY NATIVE (the 08-16 W10 slice). Residue veins: EXTRA TURNS (Final Fortune/Last Chance/Warrior's Oath — an unbuilt family, possibly ceiling-adjacent), extra combats (Port Razer/World at War), the counter-wars instants (Pyroblast class), rituals (Geosurge/Irencrag), Sylvan Library, Scroll Rack, The One Ring (shared with Kinnan). |

⛔ THEFT decks are VETOED for training (the vault's no-theft-training ruling) — that archetype gap
stays open on purpose. Veyran = the draw-go seat (never a gap).

**ALREADY AT THE BAR (13 — maintain, never regress; the flip-diff's LOST line is the guard;
census-verified 2026-08-15 late):** Slivers 100 · Vihaan 96 · Earth Bent 93 · Omnath 93 ·
Zaxara 93 · Mothman 91 · cdh 91 · Test Rashmi 90 · Teval Test 90 · Dragons 90 · Jurassic 90 ·
Hulk 90 · Veyran 90. (Historical note: earlier docs said "14 at the bar" — the full census says 13;
trust the census.) This list + §3's fifteen = ALL 28 DECKS in every profile (Colton's 6 + Joe's 11
+ the test profile's 11, the seven 08-15 gap decks included). **Whole-shelf aggregate: 81%
(2272/2797).** A deck missing from both lists is a BUG — re-run the bare census
(`node scripts/measure-coverage.mjs` with no arg) and reconcile.

## 4. ⭐ THE CROSS-DECK VEINS — build these AS VEINS, not per-card

When the queue reaches a card in one of these, build the SHARED machinery and measure every listed
deck. Ordered roughly by payoff:

1. **The opponent-draw punishment watcher** ("whenever an opponent draws a card, ~ deals damage"):
   🔶 MOSTLY BUILT (probed 08-16): the CORE is ALREADY native — Nekusar himself, Underworld Dreams,
   Fate Unraveler. Stragglers are each DISTINCT, not a cheap shared arm: ✅ Spiteful Visions (ND1 —
   the "a player draws" anyDraw scope, symmetric) done 08-16; Kederekt Parasite = "if you control a
   red permanent" intervening-if + "you may have ~ deal" optional (medium); Razorkin Needlehead =
   "first strike during your turn" conditional keyword (HEAVY — that's the real blocker, not the draw
   trigger). The rich cheap vein was already mined; only individual medium/heavy cards remain.
2. **The mass draw-discard WHEEL atom** ("each player discards their hand, then draws seven"-class):
   Nekusar ×~10 (the Wheels), Windfall also in Bumbleflower + Shorikai... (verify each wording —
   Wheel of Misfortune's bidding stays parked).
3. **Mother/Giver protection activation** ("{T}: target creature you control gains protection from
   the color of your choice until end of turn" — the CHOICE seam): Otharri (Mother+Giver), Light-Paws
   (Mother+Giver), Shalai (Mother, Skrelv). ONE arm, THREE decks.
4. **The flicker family** (exile-and-return-now + return-at-next-end-step): Brago himself + Soulherder,
   Teleportation Circle, Thassa, Deadeye, Ephemerate/Cloudshift/Essence Flux — ~10 in Brago; the
   ETB-reuse it powers is most of that deck's residue.
5. **The CREW mechanic** (tap creatures totaling power N → the Vehicle is an artifact creature until
   EOT): Shorikai himself + the fleet's attack triggers unlock only through it (~8-10 cards).
6. **Equipment/Vehicle ATTACK-trigger family**: Cap America ×8 (the Swords, Kaldra, Iron Man),
   Thrun (Buster Sword — ALSO in Cap + Halfshell?), Shorikai (Parhelion, Weatherlight, Indomitable).
7. **Count-scaling aura pumps** ("+1/+1 for each aura/enchantment attached/you control" — Ethereal
   Armor / All That Glitters / Sage's Reverie class): Light-Paws ×4-5, Bumbleflower (All That
   Glitters), Cap (statics-adjacent).
8. **The alt-win upkeep thresholds** (the EXISTING upkeep-win lane + new vocabulary): Bumbleflower's
   Mechanized Production (eight same-name artifacts) / Simic Ascendancy (ten growth counters) /
   Triskaidekaphile (exactly 13 in hand). Felidar already routes — the lane is proven.
9. **Shared singles seen in 2+ gap maps** (check both decks when built): Teferi's Protection
   (Kellan+Cap — CEILING-class candidate), Thassa's Oracle (Believe it!+Kinnan — the cEDH win),
   Skyclave Apparition (Brago+Shalai), Innkeeper's Talent (Bumbleflower+Shalai), Chaos Warp
   (Nekusar+Shalai), Chain of Vapor (Nekusar+Kinnan), Codsworth (Cap+Bumbleflower),
   Continue?/Arcade Cabinet (Halfshell+Bumbleflower), Orcish Bowmasters (Nekusar+Believe it!),
   Galadriel's Dismissal (Otharri+Shalai+Bumbleflower), Imposter Mech (Shorikai+Kinnan),
   Proft's Eidetic Memory (Brago+Nekusar), Silent Arbiter (Nekusar+Light-Paws).

## 5. PER-DECK RESIDUE MAPS

### 5.1 Wolverine, claws out! — 🏁 90, AT THE BAR (closed 2026-08-16; eleven slices 79→90)
Parked residue (each with its named heavy line — return only if the ceiling program ever revisits):
Neyith · Quilled Greatwurm · Berserk · the two Wolverines · HULK SMASH! · Nibelheim Aflame ·
Legolas's Quick Reflexes · Inscription of Abundance · Beastie Beatdown. **NEXT DECK: §5.2 KELLAN.**
### (history) 5.1 while active — 85, needs 5
✅ Forgotten Ancient (counter-MOVE) · ✅ The Ozolith (leave-accumulator + move-all) · ✅ Kodama
(the modified watcher; +SP//dr, +Thrun) · ✅ Warden (endure-X on the enterer) · ✅ Canopy
Gargantuan (perTargetStat:"toughness") · ✅ Well Rested (the IT-COUNTER + CONTINUATION pronoun
rewrite — the untap event, granted lane, and once-latch all pre-existed). All six SHIPPED 08-15.
BATCH-PROBED 08-15 late (Wolverine Best There Is = native-mixed and Ulvenwald Tracker =
native-activated ALREADY — ambient flips, don't re-build): the cheapest remaining, in order —
✅ **Meltstrider's Resolve (+4 — SHIPPED 08-16 with riders Pitiless Fists, Warbriar Blessing,
Wolfrider's Saddle)**: fighterReferent:"enchantedHost" on the fight atom + the blockCapOne
pseudo-keyword grant + the printed-OR-granted block-site read ·
✅ **Brotherhood Regalia (SHIPPED 08-16)**: one arm, three existing lanes (addWard + the layer-4
subtype ADD + the "unblockable" pseudo-keyword; the dual equip line was already modeled). ⚠️ PROCESS
(standing): push slice DOCS in the SAME commit as the feat — a docs-chaser push concurrency-cancels
the feat's CI run (3 cycles burned before this stuck) · **Brotherhood Regalia** (granted ward{2} exists; the blockers are likely the
"is an Assassin in addition" type-add + "can't be blocked" grant + the DUAL equip costs) ·
✅ **Cori-Steel Cutter (+7 — SHIPPED 08-16 with Monastery Mentor among six riders)**: the prowess
token peel (tokenOracle:"Prowess" — the changeling convention) + attach-source-to-last-token (the
α2 yes/no, the _lastMintedTokenIds stamp, the sequence gate at all 4 confidence sites, the
attach-iff-unattached auto-policy) · **Quilled Greatwurm** (probed: the during-your-turn combat-damage-to-ANYTHING watcher
detects NOTHING + the GY-alt-cast "removing six counters from among creatures" compound cost —
BOTH heavy; park to deck-end beside Neyith) · ✅ **Raph & Mikey (SHIPPED 08-16)**: the duo plural-verb self-attack arm + reveal-until-creature-
attacking (the reveal-until-n-lands frame + the mobilize combat-join). The arbiter-spell trio (Inscription kicked-modal-count · Beastie Beatdown two-target
delirium · Last Agni Kai fight-excess-to-mana — the excess ledger exists) are CHUNKIER — they
already PLAY via the Arbiter; take them after the body-only five. **Neyith** (the fight-or-blocked
OR-batch + the pay-offer — HEAVY, park to deck-end) ·
the anthems (Inscription of Abundance modal, Beastie Beatdown, The Last Agni Kai — arbiter-spells) ·
the spells (Nibelheim Aflame, Legolas's Quick Reflexes, HULK SMASH! — arbiter-spells) · Berserk.
THE TWO WOLVERINES — probed 08-16, both PARKED by their heavy second lines: Claws Out (the
Mutant-attack power-double is buildable — Tifa's doublePt + a triggering-referent rewrite — but the
"assign combat damage as though unblocked" static parks the card) and Fierce Fighter (the "he
fights up to one other target creature" ETB is a small fight arm, but the heal-on-damage
REPLACEMENT parks it). ⭐ **THE HONEST PATH TO 90: Cori-Steel Cutter (+1 — the may-attach pause,
8-point checklist; the policy question is REAL, a human may want to move the Cutter onto the fresh
hasty Monk) + Raph & Mikey (+1 — the reveal-until atom + tapped-and-attacking placement) + ONE of
the spell trio (+1).**

### 5.2 Kellan of the west — 74, needs 16 (ACTIVE)
PROBED 08-16 (the cast bucket): **Rashmi** — the castNth (first-spell-each-turn) trigger DETECTS;
the blocker is the effect: reveal-top + may-CAST-IT-FREE with the lesser-MV condition + else-to-hand.
⚠️ NO reveal-cast atom exists (the earlier "reveal-cast lane" note was wrong — corrected): this is a
real free-cast-from-LIBRARY subsystem (the freeCast atom is HAND-scoped; needs the library variant +
the MV-vs-trigger-cost condition + the else-branch to hand). MEDIUM-HEAVY — the deck's commander,
worth it. **Mind's Dilation** — same family, opponent-side (exile-top + may-cast-free): rides
whatever Rashmi builds. **Jace Reawakened** — a planeswalker (playable-pw; the walker program's
lane, park). **The Legend of Yangchen** — a SAGA MDFC, nothing detects (sagas are their own
program, park). The rest: 12 spells (Recurring Insight, Unexpected Results, **Teferi's
Protection** ⚠️ CEILING-candidate, One with the Multiverse, Ellie and Alan, Mystic Forge…), 4 ETBs
(Bonny Pall, Savvy Trader, Transcendent Dragon, Aang), Sakashima's Protege / Fblthp / Eladamri
(probe), The Reality Chip, The Key to the Vault, Monk Gyatso. ⚠️ FULL-PROBE VERDICT (08-16):
KELLAN HAS NO CHEAP SLICES — every residue card is a subsystem: AIRBEND (Aang + Monk Gyatso — a new
keyword action: exile + a cast-for-{2} permission), play-from-library (Reality Chip + Rashmi's
free-cast + Savvy Trader's exile-play), REBOUND (Recurring Insight), the counter-exile-cast chain
(Transcendent Dragon), a quoted-CDA token (Bonny Pall). Per §4's vein doctrine the queue JUMPS to
vein #3 (Mother/Giver — Otharri+Light-Paws+Shalai, three decks per arm) and returns to Kellan with
the airbend + play-from-library subsystems as deliberate builds; expect 2-3 ceiling flags.

### 5.3 Otharri Test — 74, needs 16
11 spells (Tithe, Blacksmith's Skill, Hour of Reckoning, Neyali, Galadriel's Dismissal, Anim
Pakal…), 4 activated (Everflowing Chalice — the multikicker charge-counter rock, HEAVY;
**✅ Mother+Giver vein #3 SHIPPED 08-16**; Kirol — copy-a-triggered-ability, heavy), 3 ETBs
(Solitude — evoke-pitch class, Rosie Cotton, Staff of the Storyteller), 2 attacks (Otharri herself
+ Aurelia). ⚠️ OTHARRI PARTIALLY DONE 08-16: her attack trigger (experience counter + N
tapped-and-attacking Rebels) NOW ROUTES — the O1 tapped-and-attacking-token machinery (split
keep-whole guard + the create-token disposition arm + the combat.attackers join, flipped Kessig
Cagebreakers +1) — but she stays body-only on her THIRD ability: "{2}{R}{W}, Tap an untapped Rebel:
Return this card from your graveyard to the battlefield tapped" (a graveyard-activated reanimate —
its own subsystem). Otharri flips when THAT lands. Ocelot Pride / Windcrag Siege (upkeep), Zack
Fair / Patrolling Peacemaker (enters-as), Glimmer Lens, Crumb and Get It.

### 5.4 Captain America Shoot your Shot — 73, needs 17 · 🔍 SCOUTED 08-16: NO CHEAP SLICES (vein doctrine, like Kellan)
Probed the vein #6 heart + statics: uniformly heavy. The 8 attack/combat-damage triggers are DISTINCT
subsystems, not one shared arm — Sword of Hearth and Home (blink + basic-land tutor), Sword of Wealth and
Power (Treasure arm ✓ but blocked on "copy your next instant/sorcery this turn" — delayed-copy), Buster
Sword (draw + cast-from-hand ≤MV), Super-Soldier Serum (mass-attach "any number of target Equipment" + a
legendary-Soldier type-add). Statics: Panther Habit = damage-prevention→+1/+1-counters REPLACEMENT (CR
615 subsystem); **Aettir and Priwen = base P/T X/X where X = your life total** — the ONE bounded candidate:
fixed base-P/T equip is ALREADY native (layer 7b), so the only gap is a DYNAMIC set-base (7b reads fixed
values only today; 7c has DYNAMIC_PT_FNS for MODIFY, not SET). That's a new layer-7b capability (parser arm
+ a dynamic-set-base branch + a controller-life reader) worth its OWN focused slice — could generalize to
other "base P/T equal to X" cards. Queue ADVANCES past Cap (→ Halfshell ⑤) like it did past Kellan; Aettir
is the named re-entry point when a layer fire comes up.

### 5.4-orig Captain America Shoot your Shot — 73, needs 17
**8 attack triggers — vein #6's heart** (Sword of Hearth and Home, Kaldra Compleat, Sword of
Wealth and Power, Iron Man, Buster Sword, Super-Soldier Serum…), 5 aura/equip statics
(Illusionist's Bracers, Aettir and Priwen, Panther Habit, Conqueror's Flail, Hammer of Nazahn),
5 ETBs (Forge Anew, Puresteel Paladin, Cloud, Mjölnir, Cap Liberator), 2 upkeep (Cap First
Avenger, Tony Stark MDFC), Zirda / Codsworth (activated), **Teferi's Protection** (ceiling-cand),
We Say Thee Nay!, Cap Living Legend, Halvar MDFC, Cap Super-Soldier (enters-as). Strategy: vein
#6 (the Sword attack-trigger family) is most of the deck.

### 5.5 Halfshell heroes — 67, needs 23 · ⚠️ NAME-TRAP LOGGED 08-16
12 spells (Heroes in a Half Shell, Splinter, Continue?, Endless Foot Assault, Fast Forward, Rat
King…), 8 ETBs (**Baxter = "Baxter, Fly in the Ointment"** — NOT Baxter Stockman; resolve exact
names before probing, Arcade Cabinet, Raphael = "Raphael, Mutant Ninja", Pizzasaur = "Dimension X
Pizzasaur", Foot Chopper = "Foot Clan Chopper", Lita = "Lita, Mechanical Engineer" 2 blockers…),
5 attacks (Shredder, Ray Fillet = "Ray Fillet, Wave Warrior" — its countered-creature combat-draw
trigger is NOT EVEN DETECTED, heavy; Mole Module = mill+cheat, Bebop, Casey Jones = "Casey Jones,
Vigilante" ETB✓ but delayed-random-discard blocker), 3 dies (Tokka & Rahzar, Vigor, Big Mother
Mouser), 2 upkeep (Irma, Tempestra), Coin of Mastery / Exploding Barrel, Donatello. Strategy:
probed 08-16 — most are distinct heavies (TMNT-mechanic oddities as warned); NO cheap arm found in
the ETB/attack buckets. **The +3 artifact-creature-pump slice (H1) came from the CORPUS, not this
deck** (Baxter Stockman ≠ the deck's Baxter). Halfshell may be a vein-doctrine skip like Kellan/Cap
— re-probe the spells bucket + "Baxter, Fly in the Ointment"/Lita specifically before deciding.

### 5.6 Shalai and Hallar Test — 69, needs 21 (drifted 67→69 from ambient machinery — re-measure first)
10 ETBs (Skyclave Apparition — vein #9, Solitude, Rishkar, Court of Garenbrig, Scythecat Cub…),
8 spells (Shalai and Hallar THEMSELVES, Chaos Warp, Winds of Abandon, Galadriel's Dismissal,
Kutzil…), 5 attacks (Krenko Tin Street, Ragavan, Kami of Celebration, Araña, Trouble in Pairs),
4 activated (Incubation Druid, **Mother of Runes — vein #3 ✅**, Hajar, Skrelv), Uncivil Unrest,
Boromir, Arwen, Innkeeper's Talent. Strategy: vein #3 + the commander pair first.
✅ **SHALAI AND HALLAR SHIPPED 08-16 (SH1, +1, deck 69→71)** — the commander's counters-put "deals that
much damage to target opponent" is native (magnitude threading + sentinel rewrite + deal-damage
countContext; hollow-gate runtime pin proves damage=counters). Remaining Shalai residue is the ETB/spell
buckets (Skyclave vein #9, Rishkar's granted-mana second ability, Court of Garenbrig's distribute+monarch)
— re-probe fresh next time Shalai comes up. The build-ready spec that WAS here (for reference):
🎯 **SHALAI AND HALLAR (the commander).**
"Whenever one or more +1/+1 counters are put on a creature you control, Shalai and Hallar deals THAT
MUCH damage to target opponent." Trigger detects (event:countersPut, scoped). The gap is TWO pieces:
(1) THREADING — the counter-put event ALREADY carries the magnitude (`{id,type,amount,controller}`,
gameState.js:1559), but checkCountersPutTriggers' scoped flush (triggers.js ~7770) does NOT pass
`ev.amount` into the pending trigger's context; thread it as `ctx.countersPutCount` (the milledCount
precedent — checkMilledTriggers threads a magnitude the same way). (2) PARSE ARM — "this creature deals
that much damage to target opponent" → `{op:"damage", source:self, targetType:"opponent",
amountContext:"countersPutCount"}` (the ptContext/combatDamageAmount precedent for context-scaled
amounts). Witness: parse pin + threading pin (ev.amount→ctx) + runtime (deals N = counters placed) +
the countersPut routing. Likely siblings: other "deals that much damage" counters-put payoffs. HIGH
value (Joe-deck law — the commander is the deck's engine).

### 5.7 Thrun Voltron — 81, needs 9
✅ Kodama (cross-deck). 7 aura/equip statics: ⭐ TOTEM ARMOR (Lion Umbra parked; verify the
Bear/Boar/Snake umbras' rider isn't silently dropped — CREED check), Prowler's Helm, Nazgûl
Battle-Mace, Strong Back, Glaive, Indomitable Might. Buster Sword (vein #6), Saryth (activated),
Kenrith's Transformation, Nyxborn Hydra (enters-as X), Thrun himself (probe what parks him),
Primal Might / Professor Hojo.

### 5.8 Brago Blink — 75, needs 15
**Vein #4 is most of it**: Brago's attack mass-flicker + Soulherder / Teleportation Circle /
Thassa / Deadeye (upkeep-phase + activated) + Essence Flux; then the 11-ETB cluster it feeds
(Detention Sphere, Skyclave — vein #9, Recruiter, Preston, Proft's, Loran, Cryogen Relic…), 3 dies
(Reality Acid, Watcher for Tomorrow, Anticausal Vestige), Strionic Resonator (trigger-copy —
heavy, park), Elesh Norn MoM (ETB-doubling replacement — CEILING-candidate), Peter Parker's
Camera (enters-as).

### 5.9 Shorikai Vehicles — 73, needs 17
**Vein #5 (CREW) is the deck**: Shorikai himself (tap-activation + Crew 8), the fleet's attack
triggers (Parhelion II, Weatherlight, The Indomitable, Ironsoul Enforcer — vein #6 overlap),
Kotori / Katsumasa (upkeep animators), Peacewalker Colossus, Mechtitan Core (dies), Mobilizer
Mech. Then 7 ETBs (Cosima MDFC, Emry, Mu Yanling, Nautiloid, Surgehacker…), 6 spells (Chain of
Vapor, Dispatch, Narset's Reversal, Permission Denied, Prodigy's Prototype…), Sai (cast), Born to
Drive, Padeem/Arcane Denial (upkeep-ish), Imposter Mech.

### 5.10 Nekusar Wheels — 71, needs 19
**Vein #1 first** (Nekusar + the punishment engines — ~7 cards), then **vein #2** (the wheel suite
~10). Leftovers: Forced Fruition / Painful Quandary (cast-punishers), Teferi's Puzzle Box (upkeep
hand-cycle), Dark Deal / Peer into the Abyss / Molten Psyche (spells), Orcish Bowmasters,
Proft's, Tergrid (heavy — the discard-theft half; fine as a CARD, watch the modeling), Library of
Leng / Phyrexian Tyranny (unclassified).

### 5.11 Bumble Flower Combo — 62, needs 28
**Vein #8 first** (the three alt-win thresholds — cheap, the combo identity, one proven lane).
Then the 14-ETB Food cluster (Arcade Cabinet, Elanor Gardner, Eriette's Apple, Frying Pan, Heaped
Harvest, Killer Service…), 11 spells (Academy Manufactor — the token-triple replacement,
Campsite Cuisine, Dusk // Dawn, Long River's Pull, Peerless Recycling…), 3 activated (Peregrin
Took, Kwain, Gingerbrute), Ms. Bumbleflower herself (cast trigger), Shoreline Looter, Hot Soup,
Feasting Hobbit, Innkeeper's Talent, Sam Loyal Attendant.

### 5.12 Light-Paws Voltron — 58, needs 32 (the floor)
**Light-Paws herself first** (cast-an-Aura → tutor another Aura MV≤ onto the battlefield ATTACHED
— the tutor lane exists; the cast-watcher + attach-on-arrival are the gaps; the deck IS her).
Then **vein #7** (the count-scaling pumps ×4-5), **vein #3** (Mother/Giver), the 13 aura statics
(Daybreak Coronet — enchanted-by-2+, Face of Divinity, Pariah — damage redirection, Darksteel
Mutation, the blessings), 9 ETBs (Sage's Reverie, Mantle of the Ancients, On Thin Ice, Brilliant
Wings, Chains of Custody…), Umbra Mystic (grants totem armor — pairs with 5.7's check),
Aetherflux (cast-count lifegain), Kor Spiritdancer, the stax-lite spells (Deafening Silence…).

### 5.13 Atraxa Superfriends — 62 (LAST of the gap decks — walker modeling is its own program)
The first deck exercising the planeswalker lanes (13 playable-pw / 7 arbiter-pw / 1 native). The
residue is mostly THE WALKERS' OWN ability sets (22 "spells" = loyalty abilities: three Teferis,
two Elspeths, two Sorins, Ugin, Oko…) + the Oaths (ETBs), Arena Rector (dies→cheat), Astral
Cornucopia, Deploy the Gatewatch. Verify Atraxa's own end-step proliferate rides the existing
proliferate atom. Approach when reached: pick the 5-6 HIGHEST-play-rate walkers and model their
plus/minus abilities as a program (loyalty machinery exists); the ultimates and the long tail may
be the ceiling call. The playable-pw tier already gives partial sim value.

### 5.14 Believe it! — 79, needs 11 (cEDH — LAST per Colton)
11 spells: the cEDH consult/storm brains — **Doomsday / Tainted Pact / Demonic Consultation**
(library-exile piles — CEILING-candidates: the Doomsday pile is a solver, not a parser arm),
Misdirection, Nanogene Conversion, Satoru…; 4 ETBs: **Thassa's Oracle** (vein #9 — the win
condition; devotion-vs-library count, buildable), Thousand-Faced Shadow, Orcish Bowmasters,
Subtlety; Lim-Dûl's Vault / Roaming Throne (unclassified), Kaito, Emrakul (cast — ceiling-cand),
Ingenious Prodigy, Moon-Circuit Hacker. Expect the densest ceiling residue on the shelf.

### 5.15 Kinnan Mana Overload — 77, needs 13 (cEDH — LAST)
9 spells (Transmute Artifact, Tezzeret the Seeker, Veil of Summer, Chain of Vapor, Mindbreak
Trap, Moonsilver Key…), 5 ETBs (**Thassa's Oracle** — shared with 5.14, Gilded Drake ⚠️
theft-CARD (fine — the veto is archetype-level), Wan Shi Tong, Endurance, The One Ring), 3 clones
(Clever Impersonator, Copy Enchantment, Imposter Mech), 3 cast (Wandering Archaic, Valley
Floodcaller, Hullbreaker Horror), Kinnan himself (the activated big-mana cheat + the mana-doubling
static — probe which half parks), Elvish Spirit Guide, Nezahal.

## 6. KNOWN CEILING CANDIDATES (confirm or break when reached; call them per deck)

Six (retrace) · Teferi's Protection (phasing) · Tasigur (delve) · Sakashima's Protege ·
Overlord of the Balemurk (impending) · Breach the Multiverse · Elesh Norn MoM (replacement
doubling) · Doomsday/Tainted Pact/Demonic Consultation (pile solvers) · Emrakul (control-theft
turn) · Strionic Resonator (trigger-copy) · the Atraxa walker long-tail. A ceiling call names the
cards, the class, and the honest % floor it leaves.
