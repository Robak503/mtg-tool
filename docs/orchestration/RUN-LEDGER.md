# RUN-LEDGER — live resume anchor for the long build run

> **The live plan is the file the WAKE-REPORT's top block names** — as of 2026-09-29
> [RELEASE-READINESS-PLAN-2026-09-29.md](RELEASE-READINESS-PLAN-2026-09-29.md) (Colton's go), then
> [OVERNIGHT-PLAN-2026-09-06.md](OVERNIGHT-PLAN-2026-09-06.md) stage ③ (② MET 2026-09-30). [NEXT-QUEUE.md](NEXT-QUEUE.md) is spent
> (fallback §B/§D only).
>
> **Release batch (CLAUDE.md §7.2):** unreleased since **v0.162.0** (tagged 2026-10-01, published 2026-10-02T00:46:20Z):
> **22 commits**, corpus **44.5% (15,246)** at the tag → **44.6% (15,440)** — +165 of that is the 10-02 card-data refresh (new
> cards, not engine work); engine gains since the tag: **+29**. The next tag comes after ~100 cards of gains (or a user-facing fix).
> Update this line when a slice lands or a tag cuts.
>
> **Read the first ~150 lines** (entries through 2026-09-04 are archived — see the footer). **Repaired 2026-09-30:** commit 26645a2a (2026-08-06)
> had inserted a byte-identical 16,069-line copy of this file's tail mid-line — a scripted `String.replace` whose
> replacement held `grep -v '\.md$'`, where JS expands `$'` to "the rest of the string". The copy is gone and the cut
> line rejoined; the repair was proven on 26645a2a itself (repaired = its parent + one contiguous 9-line insertion,
> the note that was meant). The lesson (gotchas): pass a replacer FUNCTION to `String.replace`, never a string.

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
