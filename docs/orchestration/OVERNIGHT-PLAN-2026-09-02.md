# OVERNIGHT PLAN — 2026-09-02 (Colton asleep; a 5-minute session cron keeps the seat working)

> **THE ORDER (Colton, 2026-09-02, verbatim intent):** "focus on 3 things: getting Cap with lands over
> the 90 percent mark or damn close; getting the lands section done; getting as far on Squirrel Girl as
> possible making her native" — then: "if you get Cap to basically 90, the lands fix, and SG to 90, then
> you move on to corpus." Earlier the same day: "I don't care how hard it is or slow."
>
> **A fresh seat boots from THIS file.** Read it, find the first stage whose DONE line is not met, take
> its first unfinished item, and work it through §5 in full. Do not re-plan. Do not wait for Colton —
> he is asleep; anything that needs him gets WRITTEN DOWN under §6 and you move to the next item.

Measured starting state (2026-09-02 evening): suite **1318 files / 15,090** green · corpus **39.53%** ·
**Cap America 75/100** · **Squirrel Girl 67/100** (just stored; the deck's engine is native, the
commander is not). Every number below was measured, not estimated; re-measure before claiming a stage.

---

## §1 STAGE ① — Cap America, WITH its lands, to ≥90 (or "damn close")

Cap has **25 non-native slots**: 13 land-partial · 10 body-only · 2 arbiter-spell. **The lands are the
path to 90** — the cheap card arms are gone (16 shipped 08-30 → 09-02, CAP1–CAP16). Work the lands
cheapest-first, then the two remaining single-blocker cards, then only if still short, the multis.

### 1a. The lands (probed 08-30 by ablation — do NOT re-probe, build)
| Slots | Card(s) | The ONE clause that blocks | Notes |
|---|---|---|---|
| ✅ +3 | Sacred Foundry · Hallowed Fountain · Steam Vents | "As this land enters, you may pay 2 life. If you don't, it enters tapped." | **SHIPPED (LANDS-2, 2026-09-03):** `paysLifeOrEntersTapped` + the `optional-life-payment` pause (play-land) / written pay-iff-life≥10 policy that CHARGES the life (tutor site). **All 10 corpus shocklands flipped**, zero LOST. Cap 79. The MDFC "pay 3 life" backs did not flip — they park on the double-faced back, not the clause. |
| ✅ +1 | Spectator Seating | "This land enters tapped unless you have two or more opponents." | **SHIPPED (LANDS-1, 2026-09-02):** `landEntersTapped.js` + six evaluator arms; **83 of 107 corpus lands flipped**, zero LOST. Cap 76. |
| ✅✅ +2 of 3 | ~~Mines of Moria~~ (✅ LANDS-4: the exile-three-from-graveyard COST — 63 corpus carriers, +31 flipped) · Mistrise Village · ~~Monumental Henge~~ (✅ LANDS-3) | their "unless" gates evaluate live now; each parks ONLY on its one activated ability: Mines "{3}{R},{T}, Exile three cards from your graveyard: Create two Treasure tokens" · Mistrise "{U},{T}: The next spell you cast this turn can't be countered" · Henge "{2}{W}{W},{T}: Look at the top five cards … reveal a historic card" | Same shape in Reef Roads / Wild Roads ("unless you control a Mount or Vehicle" + a Pilot-token sac ability). Mistrise's uncounterable-next-spell and Henge's look-at-5 may still park — that is honest. |
| ✅ +1 | Inventors' Fair | "{4}, {T}, Sacrifice ~: Search your library for an artifact card … Activate only if you control three or more artifacts." | **SHIPPED (LANDS-3, 2026-09-03):** the ONLY blocker was "Sacrifice Inventors' Fair" — its own name as a cost. `execSacrificeSelfName` → the same `sacSelf`. +9 riders corpus-wide. Cap 81. |
| ✅ +1 | Monumental Henge | "{2}{W}{W}, {T}: Look at the top five … You may reveal a historic card …" | **SHIPPED (LANDS-3):** the ONLY blocker was the word "historic" (CR 700.6) — now a gate on the shared tutor matcher. Weatherlight + Board the Weatherlight ride along. |
| ✅ +1 | Otawara, Soaring City | Channel — "{3}{U}, Discard this card: Return target … This ability costs {1} less … for each legendary creature you control." | **SHIPPED (LANDS-5, 2026-09-03):** prefix + four-type bounce union + live-board rider; +20 Channel riders corpus-wide. Cap 83. |
| ✅ +1 | Mistrise Village | "{U}, {T}: The next spell you cast this turn can't be countered." | **SHIPPED (LANDS-6, 2026-09-03):** per-turn flag → the cast chokepoint's `uncounterable` stamp. Cap 84. **Cap's land tail is now only the parks below.** |
| +1 | Uthros, Titanic Godcore | Station | a keyword subsystem. Probably a park — say so if it is. |
| hard | Urza's Saga · Hydroelectric Laboratory (MDFC back) · Soporific Springs (MDFC back) | Saga chapters on a land; two double-faced backs | genuine ceiling candidates — name them as such in §6 rather than sink the night into them |

**Where the land gate lives:** `coverage.js landFullyCovered` — line-granular; an unconditional
"enters tapped" line is admitted only when `staticAbilityParser.entersTapped(card)` is true, and that
function DELIBERATELY returns false on any `unless / if / may / pay` sentence (its own doc says so).
**The runtime half is the whole job:** find where the engine applies `entersTapped` at the enter
chokepoint (`resolvers.js enterPermanent` / the land-play path), add the conditional evaluation THERE,
and only then widen the classifier. A metric that credits a conditional the runtime never evaluates is
the hollow credit — CREED-forbidden. The pay-life form needs a real CHOICE (pause kind or a
deterministic policy documented as such: the AI pays life if it has ≥ N+2 and the land would otherwise
enter tapped on a turn it wants the mana — write the policy down, don't fake it).

### 1b. Cap's remaining cards (re-probed 09-02: only TWO single-blockers)
- **Illusionist's Bracers** — "Whenever an ability of equipped creature is activated, if it isn't a mana
  ability, copy that ability." An ability-COPY subsystem. Check whether a copy-ability atom exists for
  spells (Twincast-class) before building; if none, this is a park.
- **Iron Man, Titan of Innovation** — four pieces on one attack trigger: "noncreature artifact"
  sacrifice cost · optional-sac conditional tail ("If you do, …") · an EXACT-mana-value tutor filter ·
  that filter sized at 1 + the sacrificed artifact's MV. The dynamic-referent shape is CAP11/CAP14's
  (`capFromCombatDamage` / `unattachedEquipmentMv`) — copy that threading. Do the four as ONE slice
  only if each piece is ≤ ~40 lines; otherwise split and ship the exact-MV filter first (it is its
  own corpus vein).
- Multi-blockers (Mjölnir 3 lines, Zirda, Super-Soldier Serum, Sword of Wealth and Power, Forge Anew,
  the 3 MDFCs, Teferi's Protection, We Say Thee Nay!) — LAST, and only if Cap is still short of 90.

**DONE ①:** `measure-coverage.mjs captain` reads **≥90**, or every land + both singles above are shipped
or written up as parks in §6 and the number is as high as the remaining multis allow. Record the final
number in WAKE-REPORT.

---

## §2 STAGE ② — the LANDS SECTION done (corpus-wide)

Stage ① builds the arms; stage ② is making them COMPLETE across the corpus and closing the land tier.
1. Run the corpus flip-diff after each land arm — the LOST line is the whole point (a land arm touches
   `landFullyCovered`, which every land in the corpus passes through).
2. Census the remaining `land-partial` population by blocking clause (the census runbook:
   `docs/orchestration/RESIDUE-GRIND-RUNBOOK.md`). Every clause family with **≥3 corpus carriers** gets
   an arm or an explicit park entry in §6. Expected big families beyond stage ①: `enters tapped unless
   you control two or more other lands` (the Ixalan/Bloomburrow cycles), "As this land enters, choose a
   color" (the Cavern/Path family — Squirrel Girl has Cavern of Souls), the channel lands (Boseiju ×2 —
   Squirrel Girl has both), the creature-lands (Shifting Woodland, Evendo).
3. **DONE ②:** the wake report carries a table of every land-partial clause family with ≥3 carriers →
   `SHIPPED` or `PARKED (reason)`, and the corpus `land-partial` count is measured before/after.

**Progress (2026-09-03, stage ② opened after Cap's lands reached the parks; census baseline: 454
land-partial, 368 single-blockers):** ✅ reveal-lands (19, LANDS-7) · ✅ typed-basic union fetch — the
Landscapes/Panoramas (16, LANDS-8) · ✅ Channel (shipped in stage ①, LANDS-5: +20 riders) · ✅ shocklands
(LANDS-2) · ✅ "enters tapped unless" (LANDS-1, 83) · ✅ enters-with-N-counters lands (12, LANDS-9) ·
✅ storage-counter lands (13, LANDS-10 — was a METRIC-only flip, corrected 04:50; **made honest by STAGE ④-4 at
10:45**: the tap-only removal form is a real source; the {1}-costed Steppe form of 5 of them stays refused) · ✅ the Karoos + pay-{1} lands (9 + Scythe Tiger, LANDS-11) ·
✅ choose-a-color permanents (21, LANDS-12). **Measured after LANDS-12 (the DONE ② number): land-partial
454 → 368 (single-blockers 368 → 291); after LANDS-13 (the lairs, +5): 363.** ⚠️ CORRECTION to an earlier
line here: NOT every ≥3-carrier family is shipped or parked — five families of exactly 5 carriers remain
OPEN: ~~the Gates' once-only draw~~ (✅ LANDS-14b, 05:45 — "Seek a nonland card" as a seeded random
library→hand atom, CR 701.55, plus the bare "Activate only once." as the game-scoped limit); ~~the Invasion
lairs~~ (✅ LANDS-13 — the negated-subtype return cost); the Roads
("Sacrifice this land: create a Pilot token with a quoted sac ability"); the Gathering Place cycle ("Add
{X} or {Y}. Activate only if this land entered this turn OR you control a basic land" — an OR condition
the activation-gate vocabulary refuses structurally); the Overlooks (reflexive "When you do … and you gain
1 life"); and bands (5, PARK). Below 5: the Ice Age "If this land would enter, sacrifice a <type> instead"
(3), Station (2). Original queue for reference: "As it
enters, choose a color" (6 — `chosenColor` exists for Auras) · the Karoos (10) · the Gates (5) · "sacrifice
unless you pay {1}" (4). **Parks:** bands (5), the Overlooks' reflexive "When you do … and you gain 1 life"
tail (5), Station (2), **the Roads (5 — saddle unmodeled) and the Ice Age sac-instead lands (3 — a
choice-bearing pre-enter replacement), both parked 05:50 with the unpark in §6.** With LANDS-14b every
≥3-carrier family is SHIPPED or PARKED and the wake report carries the table → **DONE ② met (05:55):
land-partial 454 → 357, single-blockers 368 → 280.**

---

## §3 STAGE ③ — Squirrel Girl to 90, COMMANDER FIRST

**Progress (2026-09-03):** ✅ **SG-1 — the commander is NATIVE** (a "?"-terminated flavor-label rule, a "!" in
the activated label's character class, "squirrel" in the count vocabulary; 4/4 killed). Deck 67 → 68.
Ablation of the 33 remaining non-native cards: 19 single-blockers, ranked cheapest-first in the ledger's
SG-1 entry; 15 multis; 3 parks (Gemstone Caverns, Shifting Woodland, Evendo). ✅ **SG-2** — Woodland
Bellower · Altar of the Brood · Skullclamp shipped (+6 with riders; 6/6 killed). ✅ **SG-3** — the
Altars pay for real (+3; 7/7 killed; the payment planner's dropped cost riders fixed). ✅ **SG-4** —
Jaheira's token mana grant (+1). ✅ **SG-5** — Geier Reach Sanitarium + Lore Broker (the each-player
loot sentence, +2). ✅ **SG-6** — Elvish Spirit Guide (an exile-from-hand mana source; Simian rides, +2).
✅ **SG-7 + SG-8** — Altar of Dementia (the activated sac branch now stamps the sacrificed creature's LKI;
a sacrificed-power mill form) and Dosan (an own-turn cast lock at the instant-speed gate, symmetric; +2,
6/6 killed). ✅ **SG-9 + SG-12** — Evolutionary Leap (the reveal-until-creature frame's INTO-HAND sibling)
and Homeward Path (a mass "each player gains control of all creatures they own" reset; Vivien, Nature's
Avenger and Trostani Discordant rode the same two sentences; +4, 6/6 killed). ✅ **SG-10 + SG-11** —
Peregrin Took (a passive "+1 Food per token event" replacement at the one token-enter chokepoint) and
Frenzied Baloth ("Combat damage can't be prevented" — the fog latch, every printed/attached wall, the counter
shields, the floating shields and the prevent-style replacement ops all inert for COMBAT damage; +2, 7/7
killed). ✅ **SG-13** — Vexing Bauble (the dispatcher now knows whether mana was spent; a "no mana was
spent to cast it" intervening-if; "counter that spell" on a cast trigger — rewritten at the trigger
splitter so a spell's own "counter that spell instead" can never borrow it; Hesitation, Lunar Force and
Jace's emblem rode along; +4, 8/8 killed). ✅ **SG-14** — Allosaurus Shepherd (the colour axis of the
"…spells you control can't be countered" family, enforced where counter targets are enumerated; a
subtype-filtered base-P/T set with a same-turn Dinosaur add, collapsed ahead of the " and " split; +1,
8/8 killed — and a fixture typed from memory caught by the flip-diff: the card prints "other CREATURE
types"). ✅ **SG-15a/b** (the overnight cron, 06:00–06:50) — the drawn-this-turn card ledger, then Sylvan
Library end to end (an optional draw-two atom; a chained per-card pay-4-or-put-back pending choice with
its Academy panel; +1, 7/7 killed). ✅ **SG-16** — Boseiju's channel (the union destroy target, the "That
player" rider connective, the typed-basic search; Volatile Fault and Dalek Drone rode along; +3, 6/6
killed). **Deck 85/100 — the walk's honest end:** every remaining card is a multi-slice program or a park
(§6). ③'s DONE line (≥90) is NOT met; the residue is named in §6 as ceiling-class for one night.
✅ **SG-17** (night cron 2026-09-03) — The One Ring (+14 riders: a named-counters-on-source count kind with honest
LKI reads; 12/12 killed). **Deck 89/100.** Remaining 11: Endurance · Duskwatch Recruiter · Shang-Chi · Disruptor
Flute (arms) · Gemstone Caverns · Shifting Woodland · Evendo · Urza's Saga · Itlimoc · Invasion of Ikoria · Tezzeret
(parks). ✅ **SG-18** — Shang-Chi (haste-for-abilities static + the first activation-only spend restriction;
Thousand-Year Elixir rode; Steelswarm Operator un-credited as a closed FP). **Deck 90/100 — DONE ③ MET.**

Stored 09-02 on Colton's profile (100/0 unresolved). **67/100**: 14 native-mana · 10 native-spell ·
5 native-trigger · 4 native-activated · 5 native-static · 1 native-mana-aura · 6 native-mixed ·
22 land · **9 land-partial · 21 body-only · 2 arbiter-spell · 1 arbiter-pw**.

1. **The commander.** The Unbeatable Squirrel Girl is `body-only`. Probe her FULL oracle first (the
   intake read truncated her second ability). Ability 1: "Do You Like Squirrels? — Whenever ~ enters or
   attacks, create a 1/1 green Squirrel creature token." (an enters-OR-attacks disjunction — the Wise
   Mothman split shape exists). Ability 2: "I LOVE Squirrels! — …" (read it). Make her native; a Joe-deck /
   Colton-deck commander flipping is the highest-value single card on the shelf.
2. Stage ② should already have taken most of the 9 partial lands (Cavern of Souls, Boseiju ×2, Evendo,
   Shifting Woodland, Urza's Saga, Gemstone Caverns, Deserted Temple, Urza's Cave…). Re-measure.
3. Then the 24 real cards by ablation (probe → the cheapest single-blocker first). Intake gap buckets:
   8 ETB triggers (Altar of the Brood, Endurance, Itlimoc, Invasion of Ikoria, Tezzeret Cruel Captain,
   The One Ring…) · 4 unclassified (Disruptor Flute, Dosan, Evolutionary Leap, Frenzied Baloth) · Archdruid's
   Charm · Tempt with Discovery · Duskwatch Recruiter · Sylvan Library · Skullclamp · Vexing Bauble.
4. **DONE ③:** `measure-coverage.mjs squirrel` reads **≥90**, or the remaining residue is named as
   ceiling-class in §6 with the honest number.

---

## §4 STAGE ④ — the corpus grind
**Progress (night cron 2026-09-03):** stages ①–③ met/parked → ④ opened via RESIDUE-GRIND-RUNBOOK (fresh census in
the scratchpad). ✅ **④-A** — Aura-own cumulative upkeep composes with the aura tier (Mind Harness, +1; 2/2 killed).
✅ **④-B** — dies-damage-by-power on the dying-creature look-back (+7; 5/5 killed).
✅ **④-C** — Kinnan's dig-to-battlefield with a random rest and a negated-subtype filter (+3; Joe's commander; 9/9).
✅ **④-D** — the tapped-for-mana trigger event (+2: Zhur-Taa Druid, Vorinclex; 10/10).
✅ **④-E** — Nikya's noncreature cast lock (+1; 4/4).
✅ **④-F** — "target opponent creates … creature tokens" (+7: Forbidden Orchard, the Hunted cycle, Ox Drover; 5/5).
✅ **④-G** — the flashback grant (+6: Snapcaster Mage and kin; 7/7). Corpus 40.6%.
✅ **④-H** — the en-Kor damage redirect on the prevention shield (+5; 7/7).
✅ **④-I** — Savage Firecat: land-tap trigger with a non-mana payoff + enters-with six..ten (+3; 6/6; two stale pins rewritten).
✅ **④-J** — Bubble Snare: kicker on the Aura cast lane (+1; 8/8).
✅ **④-K** — control Auras carry their bonus (FP closed on Spirit Away / Yavimaya's Embrace / Corrupted Conscience) + Hypnotic Siren's bestow steal (+1; 7/7).
✅ **④-L** — "sacrifice this Aura unless you pay": the upkeep tax on an Aura (+4; 2/2).
✅ **④-M** — annihilator + a routing trigger compose (+2; 3/3).
✅ **④-N** — the Aura's own one-shot on its host: exile / bounce (+7; 5/5).
✅ **④-O** — Reinforce on a spell: the hand-zone option joins the cost-only strip (+4; 3/3).
✅ **④-P** — "target player exiles a card from their graveyard": the target player's own pick through the milled-pick pause (+3; 6/6).
✅ **④-Q** — "Sacrifice this Aura: <effect on enchanted creature>": the host by last known information (+6; 4/5 killed (+1 documented redundant guard)).
✅ **④-R** — a mana source with a graveyard-zone ability: the zone composition on the mana tier (+2; 2/2).
✅ **④-S** — the self-sacrifice Aura composite: exile the host and make a token (+2; 1/3 killed (+2 documented redundant guards)).
✅ **④-T** — GY-3: targeted graveyard exile-cost abilities (+12; 5/5 killed).
✅ **④-U** — "untap up to seven lands": Palinchron / Great Whale (+2; 2/2).
✅ **④-V** — Thrun, Breaker of Silence: the nongreen target shield (+2; 6/6 killed). **Thrun Voltron 90/100.**
✅ **④-W** — the granted except-by evasion: Prowler's Helm / Invisibility / Seeker (+3; 6/6 killed).
✅ **④-X** — Command Beacon: the commander from the command zone to the hand (+1; 3/3).
✅ **④-Y** — "each opponent gains N life": Aria of Flame (+1; 3/3).
✅ **④-Z** — the Opus cycle: the mana-spent amount + the "… instead" pair as runtime conditions (+6; 6/6 killed).
✅ **④-AA** — the non-targeted "return a <filter> card from your graveyard to your hand", chosen as it resolves (+9; 6/6).
✅ **④-AB** — City of Brass: "this land" joins the becomes-tapped self nouns (+1; 2/2 killed).
✅ **④-AC** — "target creature with a [+1/+1] counter on it": the subject-qualifier peel + the hasCounter restriction (+12; 5/5 killed).
✅ **④-AD** — the two-keyword grant keeps its counter-bearing subject whole in splitClauses (+2; 2/2 killed).
✅ **④-AE** — "target attacking / blocking creature" (the combat-role peel) + the COMBAT WINDOW for combat-role activated abilities; 28 hollow credits made honest (+30; 8/8 killed).
✅ **④-AF** — "another target … creature" (notSource) + "with / without <keyword>" (hasKeyword, curated vocabulary) on the subject peel (+26; 5/5 killed).
✅ **④-AG** — "with power / toughness / mana value N or less / greater" on the subject peel (+21; 6/6 killed).
✅ **④-AH** — "defending player / that player controls" on the subject peel; the routing gate keeps it honest (+2; 5/5 killed (a sixth, the early stacked-referent stamp, had no carrier and was deleted)).
✅ **④-AI** — goad as an effect atom: mustAttack + goaded until the goader's next turn, the goader on the source, "enemy" target intent for the flush (+6; 7/7 killed).
✅ **④-AJ** — the bound-pronoun goad ("… Goad it.") as a referent atom (+2; 2/2 killed).
✅ **④-AK** — the rest of CR 207.2c's ability words on the shared label list, four excluded on purpose (+2; 3/3 killed).
✅ **④-AL** — thirty-four measured flavor words on the trigger-label list (+34; 3/3 killed).
✅ **④-AM** — the attack tax's second printing (Baird, Archon of Absolution) (+2; 3/3 killed (a fourth, {X} read as {1}, had no carrier — Sphere of Safety's 'where X' tail refuses it before the digit class does — and was deleted)).
✅ **④-AN** — batch combat damage once per damaged player + the referent (+2; 4/4 killed). ✅ **④-AO** — the X-magnitude activated lane + mixed-pip X cost + "gain X life" (+18; 6/6 killed). ✅ **④-AP** — the AI uses the combat window (+0; 4/4 killed).
✅ **④-AQ** — "up to one target creature" on the creature lane (+22; 3/3 killed).
Queue = the census's two-flip / bug-signature leads (see WAKE-REPORT top).
Only after ①–③'s DONE lines are met. Boot from the vault's `memory/orders/cindy-corpus-roadmap.md`
(WHAT/WHY/ORDER) + the repo's `RESIDUE-GRIND-RUNBOOK.md` (HOW): fresh census, largest clause family with
existing machinery first, vein doctrine — build systems, register cards.

**Stage ④ scope verdict (07:15, runbook §3.5 — banked before building):** the 04:00 census (scratch
census-2026-09-03.txt) says the corpus single-blocker tail is down to ≤6-card families; the two defect
reports are 1–3-card composition cases each (a DFC, morph, evoke). Among the non-Alchemy families with
EXISTING machinery, **clash** is the largest honest lever: 35 corpus carriers, **13 sole-blocked by the
clash line** (Nath's Elite / Oaken Brawler / Paperfin Rascal / Bog Hoodlums / Adder-Staff Boggart's ETB
"clash with an opponent. If you win, put a +1/+1 counter on this creature" ×5; Sentry Oak, Springjack
Knight, Fire Juggler, Ringskipper, Entangling Trap, Sylvan Echoes, Rebellion of the Flamekin, Merfolk
Surveyor). What exists: reveal-top, top/bottom placement, MV reads, the trigger context channel (the
`manaSpent`-style intervening-if precedent). What's missing: a `clash` atom (CR 701.22 — each clashing
player reveals their top card, may put it on the bottom; the controller wins iff their card's mana value is
higher) with a deterministic opponent pick + top/bottom policy, and "if you win/won" as a context
condition binding the payoff. Expected flip: the 5 ETB-counter cards first (one shape), the rest as the
payoffs are confirmed modeled. ✅ **STAGE ④-1 shipped (07:45):** the clash atom + "if you win" as a
condition — the five ETB-counter carriers flipped (+5, 6/6 killed); Fire Juggler / Ringskipper / Sentry
Oak wait on their payoffs, Springjack Knight on a targeting branch. ✅ **STAGE ④-2 shipped (08:10):** the
clash trigger EVENT — Sylvan Echoes flipped (+1, 5/5 killed); Entangling Trap and Rebellion of the Flamekin
stay on their bound-referent riders ("If you won, THAT creature/token …"). The clash family is now built
to its honest edge for one night: 6 of its 13 sole-blocked cards flipped; the rest wait on payoffs and
riders that are their own shapes. **Bug-signature probes (08:20, runbook §2's two defect reports):** Savage
Firecat, Floodchaser, Krovikan Whispers and Ray of Frost are MULTI-blockers under per-line ablation (every
single deletion stays body-only — the census's "sole" count is relative to its own line-splitting);
Bubble Snare (kicker + a kicked-ETB + a no-untap static: each alone native, together body-only) and
Hypnotic Siren (bestow + "you control enchanted creature") are TIER-COMPOSITION failures — one card each,
banked here for a composition-rule slice rather than built at 08:20. Next honest corpus levers after clash
are subsystem-scale (morph ~164, initiative/ring ~126, quoted-grant statics ~133) — Colton's pick.

---

## §5 THE PER-SLICE DISCIPLINE — never skip a step (SHELF-TAIL-PLAN §2, plus what 09-02 re-taught)

probe (print the FULL oracle + which line blocks — half the "gaps" are one missing arm on machinery that
exists) → build the smallest honest arm → **flip-diff by tier snapshot** (audit every gained row
whole-card; a LOST row is the whole point) → **witness file** with seen-to-fail controls → **mutations**
(`false &&` each arm; the named test must die; restore) → **ONE sequential lint + FULL suite, exit codes
unpiped** → RUN-LEDGER + CHANGELOG → measure the deck(s), update SHELF-TAIL-PLAN + WAKE-REPORT → commit,
push, **CI green (`gh run list`) before the next push**. THE CREED: false-negative SAFE, false-positive
FORBIDDEN. Stale MUST-STAY-LOW pins that flip are GRADUATED with the date + a surviving guard-class control.

**The 09-02 traps — each cost real time today, none may recur:**
1. **Never script a rewrite whose payload contains a regex escape.** `\b` became a literal 0x08 byte
   TWICE through the python/heredoc path; the source LOOKED right and matched nothing. Use the Edit tool
   for anything with a backslash. After any scripted edit: `grep -c $'\b' <file>` must print 0.
2. **Encode before opening for write, or temp-then-rename.** `open(p,'w')` truncates BEFORE the encode
   error throws — it zeroed two tracked files today (git restored them). Emoji as literals, never `\uD83D`.
3. **A mutation is not a mutation until you have SEEN it applied.** A `sed` that failed on `{}` left the
   source untouched and the suite passed — that is not a gate. Assert the match count. A "no tests" result
   is a LOAD ERROR, not a gate result — redo it with valid syntax.
4. **Full suite after every slice, never the targeted run alone.** Three stale-pin classes today were
   caught ONLY by the full suite.
5. **Chain verification steps with `;`, never `&&`.** `grep -c … && npx eslint .` reported LINT_EXIT=1 when
   grep found zero matches — lint never ran.
6. **A surviving mutation gets one of three answers, always written down:** DOCUMENT it (a live early exit
   that is real but redundant — CAP14 M4) · DELETE it (unreachable or duplicated — CAP15 M2, CAP16 M2) ·
   **WRITE THE MISSING TEST** (a real behaviour nothing asserted — CAP16 M4, the log). Never ignore it.
7. **COMMS feed:** every card PARKED gets a terse line in `memory/COMMS.md`, anchored on the exact
   `## LOG (newest first)` line (never on another agent's entry), then `sync-brain.cjs`. Flips need no line.
8. **Dates:** stamp entries with the real date (`date`). The 08-30 stamps on today's ledger entries are a
   known drift (the box's clock read 09-02); do not propagate it.
9. **Deck writes go through the app's own API** (`POST /api/decks`, server at 127.0.0.1:3000, `createBackup:
   true`), never a direct AppData write — Claude Desktop is MSIX-packaged and direct writes land in a
   private mirror the app never sees.
10. **A gate with no carrier in its own witness is unproven — when a mutation survives, first ask whether
    ANY fixture reaches the line.** LANDS-1's M7 (the reader's parseable gate) survived not because the gate
    was dead but because the park fixture's sentence shared a line with a preceding sentence, so the
    LINE ANCHOR refused it before the gate ran. The fix was a fixture that is refused ONLY by the gate
    (a single-line unreadable condition) plus a readable positive control. Write the carrier, re-run,
    then record the kill. Sibling of trap 6: the survive → document / delete / test decision needs the
    "does anything even reach it?" question answered first.

---

## §6 PARKED / NEEDS COLTON (append as you go — this is the morning report's raw material)

- ✅ **[Per-defender BATCH combat damage — SHIPPED as ④-AN, 2026-09-04 night (+2; 4/4 killed)]** (the sizing note follows for the record)
- **[Per-defender BATCH combat damage — 2026-09-03 night, sized, not started — Cindy lane]** `checkBatchCombatDamageTriggers`
  fires the bare and subject-filtered "whenever one or more <creatures> you control deal combat damage to a player" batches
  ONCE per attacking player (documented as the design), with a context that names no defender. CR-wise it triggers once per
  player dealt damage (the Anowon ruling), and the per-defender machinery already exists for the keyword-filtered batches
  (`perDefender: true`, ctx `damagedPlayerId` + `combatDamageAmount`). Making every batch per-defender is a rules
  correction (an under-fire today, FN-safe) AND supplies the referent the routing gate needs for "that player" — Alela
  (goad), Popular Entertainer, Feline Sovereign flip; the other 12 batch-that-player carriers park on their effects
  (loses half life, exile the top of that player's library, manifest). Touches a shipped subsystem with its own
  once-per-controller pins — a fresh-session slice, not a night tail.
- ✅ **[X-scaled-MAGNITUDE activated abilities — SHIPPED as ④-AO, 2026-09-04 night (+18; 6/6 killed)]** (the sizing note follows for the record)
- **[X-scaled-MAGNITUDE activated abilities — sized 2026-09-03 night — Cindy lane]** Kessig Wolf Run's "{X}{R}{G}, {T}: target
  creature gets +X/+X" parses HIGH, but the activated lane admits {X} costs only for targets-per-X programs (`costXTargetCount`);
  an amountX magnitude has no runtime path (choose X from 1..affordable, thread xValue). The spell lane already does this for
  X spells — the activated twin is the work. Carriers: the {X} pumps on lands and creatures (count first).
- **[The remaining {X} effect shapes — sized 2026-09-04 night, NOT built — Cindy lane]** After ④-AO the X lane reads any
  xSpell program, so what parks now is the EFFECT vocabulary: "put X +1/+1 counters on target creature / on it" (11 cards,
  but nearly all co-blocked — Repulsive Mutation's "unless its controller pays mana equal to the greatest power", Nova
  Flame's "damage equal to its power to each other creature", the Fractal cycle's "create a 0/0 … put X counters on IT"
  bound pronoun), "you lose X life" (9, mostly beside an X cost rider — Skeletal Scrying's additional exile-X cost,
  Malicious Advice's "tap X target artifacts, creatures, and/or lands"), Profane Command's choose-two. Honest yield ≈ 2–3;
  the add-counter arm needs `ctx.hasX` gating like radClauseParser's. Park until a deck walk names one.
- ✅ **[The AI and combat-role activations — SHIPPED as ④-AP, 2026-09-04 night (4/4 killed)]** (the sizing note follows for the record)
- **[The AI and combat-role activations — 2026-09-03 night — Cindy lane]** ④-AE's combat window offers archers and pumps in
  combat to the human; `pickSafeAbilityActivation` skips every TARGETED activation, so the AI never shoots. A targeted
  picker (an attacker/blocker as target, the same side rules the flush chooser uses) is the play-quality half.
- **[Grafted Identity — the additional-cost sacrifice on an AURA cast, 2026-09-03 night — Cindy lane]** Since ④-K
  its body (control + a +1/+1 bonus) is native, and only "As an additional cost to cast this spell, sacrifice a
  creature." parks it. Measured on a board: the additional-cost lane emits the cast with the victim chosen but
  **no host target** (`targets: []`), because that lane's target expansion knows nothing of Aura hosts. Crediting it
  as-is would offer an Aura cast that cannot attach (CREED). Fix = the AC expansion enumerates aura hosts
  (isAuraSpell + one cast per legal host × victim) — a lane change for ONE card; parked, not forgotten.

- **[Per-line spend restrictions, 2026-09-03 night — Cindy lane]** Steelswarm Operator (and any card printing two
  differently-restricted mana lines) needs each restricted line parsed on the ④-3 extra-line machinery with its OWN
  restriction, instead of one whole-card restriction. Today the card is refused (honest). Also the activation-only
  form for non-creature source words ("abilities of artifact sources") needs an `activatingIsArtifact`-style context.

- **[TEMPTING OFFER family, 2026-09-03 — Cindy lane, engine parks]** the state machine ships for Tempt with
  Discovery's land payoff. The seven other tempting-offer cards (Tempt with Vengeance / Reflexes / Glory /
  Immortality / Bunnies / Mayhem / …) each need their own accept-payoff atom on the same chain (tokens, a creature
  from the graveyard, +1/+1 counters, …) — one small arm each, none needs Colton.

- **[CAP-BRACERS family remainder, 2026-09-03 — Cindy lane, engine parks]** the `abilityActivated` event ships for
  the plain / creature / artifact / artifact-or-creature / single-word-subtype filters. Still parked, each one a
  small arm on the same checker: **Sarkhan's Whelp** + **Leori, Sparktouched Hunter** (a two-word planeswalker-type
  filter "of a Sarkhan planeswalker" / "of a planeswalker of that type" — needs a planeswalker-subtype reader and,
  for Leori, a chosen-type stamp); **Ertha Jo, Frontier Mentor** ("that targets a creature or player" — read the
  activated stack object's targets); **Elrond, Moon-Reader** — CORRECTED after probing: his trigger already reads
  whole (the once-per-turn rider is enforced at the universal flush chokepoint, event-agnostic); the park is his
  {5}{U}{U} blink ("exile up to two other target nonland permanents you control, return them at the next end
  step" — a two-target delayed return, unmodeled); **Ashnod the Uncaring**
  ("if one or more permanents were sacrificed to activate it" — thread the cost's sacrifice list into the activation
  context); **Verrak, Warped Sengir** ("if life was paid to activate it … pay that much life again" — thread the
  paid-life amount). None needs Colton.
- Squirrel Girl's Archidekt URL — not captured; the deck does not survive a box move until it is.
- **Cap America (84/100) — every remaining card is multi-piece or a park:** Uthros, Titanic Godcore ·
  Station (a keyword subsystem — a charge-counter station action + a threshold-unlocked ability); Urza's
  Saga (Saga chapters on a land); Hydroelectric Laboratory / Soporific Springs (MDFC backs); Illusionist's
  Bracers (an "ability … is activated" trigger event + a copy-ability lane, neither exists); Iron Man
  (three pieces: a "noncreature artifact" optional-sac filter, a MV = sacrificed+1 relational tutor, an
  ARTIFACT battlefield-tutor admission); Teferi's Protection / We Say Thee Nay! (arbiter spells). Unpark =
  each is its own multi-slice program; none is one word.
- **Land tier (stage ②) parks, ≥3 carriers:** bands (5 — "bands with other legendary creatures", a retired
  keyword); the Overlooks' reflexive "When you do … and you gain 1 life" tail (5 — the typed-basic fetch is
  fixed, the reflexive-with-rider shape is not); Station (2). Every other family with ≥3 carriers shipped.
- **Squirrel Girl (77/100) parks:** Gemstone Caverns (an opening-hand replacement — no pre-game seam);
  Shifting Woodland (becomes a copy of a graveyard permanent card); Evendo, Waking Haven (Station); the
  multis: Cavern of Souls (choose a creature type + an uncounterable-creature-spell mana source), The One
  Ring, Endurance (evoke is not modeled), Disruptor Flute, Shang-Chi, Tezzeret, Urza's Saga, and the X-spells
  (Genesis Wave, Finale of Devastation, Green Sun's Zenith, Chord of Calling, Archdruid's Charm, Nature's
  Rhythm, Tempt with Discovery). Mediums still open: Sylvan Library (a pay-4-life-or-put-back pending
  choice — its own pending-choice stack, a full slice), Boseiju's channel effect (destroy + the opponent's
  basic-typed search + a legendary-count cost reduction — three pieces). (Shipped since this line was first
  written: Elvish Spirit Guide SG-6, Altar of Dementia SG-7, Dosan SG-8, Evolutionary Leap SG-9, Peregrin
  Took SG-10, Frenzied Baloth SG-11, Homeward Path SG-12, Vexing Bauble SG-13.)
- **Two engine holes found and FIXED tonight, worth a human eye on old harness data:** (a) the payment
  planner never carried cost riders — a planned Molt Tender tap exiled nothing until SG-3; (b) a played
  Vivid/depletion/Gemstone land arrived with no counters until LANDS-9. Any self-play game before tonight
  that involved those cards under-paid.
- **⚠️ FOUND 04:20 — multi-line mana lands under-offer at runtime (a credited-native runtime gap, measured):**
  the mana model reads ONE mana line per card (parseAddClause takes the first "Add" clause), so a land that
  prints two "{T}: Add …" abilities only ever offers the first. Census (scratch census-multiline-mana2.mjs):
  **114 lands** whose second mana line is never offered; **55 of them are credited tier "land"** (fully
  covered) — Tainted Isle taps for {C} only (its Swamp-gated {U}/{B} never fires), the Verge cycle, the
  Gathering Place five, Mogg Hollows' "doesn't untap" cycle (10), the pay-life duals (6), the sac-this-land
  rituals (5), "Spend only on a creature spell" lands (5), and 28 whose FREE colourless line hides behind a
  painful any-colour first line (Grand Coliseum pays life it never had to). Found while building the
  Gathering Place gate (LANDS-14): the condition shape worked, the classifier admitted the line, and the
  flip would have been runtime-vacuous — so it was NOT shipped (reverted; the honest fix is the runtime,
  not the claim — feedback_retired_fp_reevaluation). **Unpark = multi-product mana:** one source record per
  mana line (each parsed as its own single-line ability), planner + commit treating records of the same
  permanent as mutually exclusive (one {T} per permanent), every manaSources consumer re-gated. A real
  subsystem slice, a few hours with gates; it also makes the 55 credited lands honest. Your call on priority
  against stage ④'s subsystems (morph ~164, initiative/ring ~126, quoted-grant statics ~133).
  **→ ✅ STAGE ④-3 (the cron, 09:00–10:15): the runtime half SHIPPED for every complete second line.** A land's
  second "{T}: Add …" / "{T}, Sacrifice this land: Add …" line (optionally "Activate only if …") is its own
  source record on the same permanent, gated live; the planner never taps a permanent twice; the "this land
  entered this turn" condition is readable. Measured: **41 lands now offer an extra line — 22 gated (the
  Tainted lands, the Verges, the Gathering Place five), 17 sacrifice rituals, 3 free colourless taps.** The
  slice's witness and census also caught **four live FPs in the OLD main product and fixed them**: Ancient
  Spring's and Spawning Bed's plain taps sacrificed the land; Grand Coliseum handed out a PAINLESS any-colour;
  Hall of Oracles gave its {1}-costed any-colour for free; a Pathway's back face tapped on the front. Still
  unmodelled (fail-closed, honest): a second line with a pain / pay-life / doesn't-untap rider.
  **→ ✅ STAGE ④-4 (10:45): the tap-only counter-removal mana SHIPPED** — the 11 storage lands spend their
  counters (LANDS-10's credit is honest now) and the five Mana Batteries flipped (+5); a two-pass planner
  preserves stored counters unless the cost needs them. Still refused: the {1}-costed forms (the Saltcrusted
  Steppe cycle, Crucible of the Spirit Dragon, Petalmane Baku — no mana-costed mana source).
  **→ ✅ STAGE ④-5 (11:00): the rider-bearing second lines.** Three shapes: (1) PAY-LIFE LANDS — the pay-life
  reader excluded lands, so Horizon Canopy, Silent Clearing, the whole Horizon cycle and Mana Confluence
  made their colours for FREE (a live FP, measured); a land pays life like a rock now, is not offered at 1
  life, and the commit charges it. (2) The "doesn't untap during your next untap step" duals (Mogg Hollows
  and the Tempest cycle ×10) — the coloured line is offered with its rider and the tapped land skips its
  next untap step. (3) Grand Coliseum's any-colour painland form — read WITH the pain, first in the Add
  parser. Still refused: any other rider on a second mana line.
  **The mana lane's honest edge for one night (11:10).** What remains is one shape: the MANA-COSTED mana
  ability ("{1}, Remove X storage counters: Add X mana …" — the Saltcrusted Steppe cycle ×5, Crucible of the
  Spirit Dragon, Petalmane Baku; and "{1}, {T}: Add one mana of any color" — Hall of Oracles). The planner
  has no source that costs mana to make mana: paying the {1} from OTHER sources first is an ordering
  problem inside a greedy planner, not a reader — its own slice (~2h with gates). PARKED here, not for
  Colton's judgment but for a fresh seat's hours.
- **The Roads (5 — Reef/Wild/… Roads) · PARKED 05:50:** "{1}{U}, {T}, Sacrifice this land: Create a 1/1
  colorless Pilot creature token with 'This token saddles Mounts and crews Vehicles as though its power were
  2 greater.'" The token is a quoted STATIC on two verbs; crew is modeled (the crew power sum in legalChoices
  + the dispatcher), **saddle is not modeled at all** (no saddle action, no Mount subsystem). Minting the
  token would credit a static the engine can honor only halfway — absence ≠ value. Unpark = a saddle
  subsystem (mirror crew: a saddle action + the power sum), then the quoted-static allowlist in the token
  parser + the "+N as though" reader at both crew/saddle power sums.
- **The Ice Age "If this land would enter, sacrifice a <type> instead" (3 — Lake of the Dead class) ·
  PARKED 05:50:** a pre-enter REPLACEMENT with a player choice (sacrifice a Swamp to let it enter, or it goes
  to the graveyard). The enter chokepoints run replacement effects that have no choice (enters-tapped,
  counters, colour picks); a choice-bearing replacement before the permanent exists needs its own pending
  choice on the play-land / enterPermanent paths. Unpark = the shockland pause pattern (LANDS-2) at the
  pre-enter site with a sacrifice picker.
- (append here: card · blocker · why it parks · what would unpark it)

## §8 DAY ORDER — 2026-09-03 (Colton, 11:35, after the morning report)
Colton's words, verbatim intent: Teferi's Protection — "gate the protection aspect and the rest going to
arbiter"; Illusionist's Bracers — "a big win con in cap"; "whatever you can't do for cap make the arbiter
ruling and doc update for those cards (or make a comms for omnath to handle that)"; "pro is a huge card so
hard to not have that one done"; for Squirrel Girl "cavern is also big as it's used in sg and other tribal
decks at large", then "the program work — all those cards are used lots of places like zaxara for the x spells".
**The order:**
1. **Teferi's Protection** — ✅ **SHIPPED WHOLE, 2026-09-03 (CAP-TP)** — player shield (life lock + protection
   from everything at the life chokepoints, player targeting, both damage funnels), PHASING as a splice
   (`phasedOut`, phase-in before untap at the controller's untap), self-exile via the program stamp. Cap 84 → 85.
   Original brief: build every deterministic half (until your next turn: your life total can't
   change; you gain protection from everything; all permanents you control phase out; exile the spell). If
   phasing cannot be modeled honestly the WHOLE card gates to the Arbiter with a ruling — never a half-native
   spell (the CREED). Reading of "gate the protection aspect": the protection/life-lock is the part to make
   native first; "the rest" = whatever a single slice cannot carry.
2. **Illusionist's Bracers** — ✅ **SHIPPED, 2026-09-03 (CAP-BRACERS)** — the `abilityActivated` trigger event (both
   dispatcher push sites), the "isn't a mana ability" intervening-if, the `copy-activated-ability` atom (same targets;
   retargeting = later arm). +6 with the family (Battlemage's Bracers, Rings, Kurkesh, Crackdown Construct, Ceaseless
   Searblades). Cap 85 → 86. Parked from the family (§6): Sarkhan's Whelp / Leori (two-word planeswalker-type
   filter), Ertha Jo ("that targets a creature or player"), Elrond (once-per-turn rider), Ashnod the Uncaring
   ("if one or more permanents were sacrificed to activate it"), Verrak ("if life was paid to activate it").
   Original brief: "Whenever an ability of equipped creature is activated, if it isn't a mana
   ability, copy that ability. You may choose new targets for the copy." — an ability-activated trigger event
   + a copy-ability resolution (re-run the activated program with retargeting).
3. **Cap's remaining parks → Omnath** for Arbiter rulings + curated play-hints (COMMS [Q-CAP-ARBITER], 11:40).
4. **Cavern of Souls** — ✅ **SHIPPED, 2026-09-03 (CAP-CAVERN)** — the chosen-type spend restriction (parsed as its
   own form, resolved per permanent), the coloured line as an extra mana record, `uncounterableIfSpent` from the
   plan's taps to the cast site's stamp, the chooser on a land drop. +3 (Unclaimed Territory, Pillar of Origins).
   Squirrel Girl 85 → 86. Secluded Courtyard's "or to activate an ability" tail stays refused (§6).
   Original brief: choose a creature type on entry + a spend-restricted any-colour source whose mana
   makes the creature spell uncounterable.
5. **The X-spell program** — Genesis Wave, Finale of Devastation, Green Sun's Zenith, Chord of Calling,
   Archdruid's Charm, Nature's Rhythm, Tempt with Discovery — shelf-wide (Zaxara).
   Status 2026-09-03: five were already native; **Archdruid's Charm ✅ SHIPPED (⑤a)** — tutor per-card destination
   rider + bite counter-first rider; **Tempt with Discovery ✅ SHIPPED (⑤b)** — the tempting-offer state machine on
   the tutor settler + an opponent-side pause (panel + AI policy). **Item 5 done; the day order is complete on
   Cindy's lane** (item 3 = Omnath's rulings, [Q-CAP-ARBITER]).
Every item through §5 in full; parks to §6 + COMMS.

## §7 WHAT THE MORNING REPORT MUST CONTAIN
The three stage numbers (Cap %, land-partial corpus count before/after, Squirrel Girl %), every slice
shipped (SHA + card + tests), every park in §6, every trap that fired, and the suite/CI anchor. Facts
exact; the voice wraps them.
