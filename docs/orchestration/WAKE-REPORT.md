# WAKE REPORT — live resume anchor

## 🌃 2026-07-17 (night shift, RUNNING) — shelf-first team era: 30.95% (+27 tonight), suite 9,042 — 2 Fable seats hot

> **The state**: census **10,574 of 34,161 (30.95%)** native+land (name-dedup; tally = `native*`+`land`
> rows, playable-pw excluded). Master tip **61625022** · suite **9,042 green** · lint 0 · LOST=0 on every
> flip-diff · no release tag since v0.144.0 (the unreleased train accumulates). **Shelf-first per Colton's
> evening call** — the fresh 15-deck census (real profiles, re-imported to the box app tonight) reads
> aggregate 81% native; worst-first: Wolverine 68 · Kellan 69 · Yuriko 70 · Cap/Pantlaza 72 · Kinnan/
> Ur-Dragon 75 · Rograkh/Toph 79 · Vihaan 85 · Mothman 90 · Zaxara 93 · Koma/Omnath 94 · Slivers 99.
>
> **Landed tonight (each desk-audited, full per-slice gate, pushed serially)**: **TC-1** typal cast-draw
> (c8259299, +2 — Vanquisher's Banner / Chronicle of Victory; unblocks the Slivers card-A/B ask) ·
> **OC-1** the Ordeal cycle (b40ad2b0, +5 — all five Ordeals; NEW youSacrificeThis look-back event off the
> sacrifice chokepoint + a real Ordeal cast lane + cross-controller attack-watcher hardening) · **SB-1**
> saboteur cdmg payoffs (54d22160, +4 — Skullsnatcher / Mistblade Shinobi / Zombie Cannibal / Arm with
> Aether; damagedPlayer bounce + gy-exile scopes) · the **cdmg cross-controller hardening** (df7608aa,
> director solo — the OC-1 mirror, 0 flips) · **SB-2** damaged-player reanimate (243e2493, +2 — Ink-Eyes /
> Scion of Darkness; NEW owner discipline at the zone-exit chokepoint — a stolen creature's death now
> lands in its OWNER's graveyard — plus the desk-completed owner-link so a detained stolen card's return
> still connects) · **LV-1** Level Up (61625022, +14 levelers; leveler.js band parser + gated 7b/6 layers
> + 2 pre-existing runtime FPs fixed: band abilities/keywords no longer always-on; NOTE: Wolverine runs
> ZERO levelers — its "Level Up" card is a green Aura, the roadmap note was stale).
> **Cite-audit law, reaffirmed**: SEVEN wrong CR citations caught at the desk tonight (207.2c→207.2a ·
> 701.15a→701.19 · 701.17a→701.21a · 601.2/603.3→109.5 · 613→106.1b · 603.3c→603.3d · 704.5g→404.1, the
> last caught by an agent in the DIRECTOR's brief). Every cite gets verified against cr_current.json.
>
> **IN FLIGHT (2 Fable seats, worktree isolation, never push)**: **SP-1** sliver interiors (census +
> group-grant buckets) · **TS-1** enchant-land activations (the Tin Street lane; licensed to pivot to
> adjacent enchant-land interiors if the family's tiny). Harvest per the standing protocol: audit
> line-by-line at the desk, re-gate, integrate serially, sweep the worktree.
> **Also tonight (pre-shift)**: v0.143.0 + v0.144.0 shipped (CI green, assets verified) · the box app
> got the REAL profiles (Colton 6 / Joe 9, 0-miss vs the oracle index; box AppData = deck truth now) ·
> the Academy turn-1 break does NOT reproduce on the current build (API + real-UI repro both healthy
> through turn 5+; likely fixed by C1 B1-B4 on 07-15; Colton re-tests on v0.144.0 with a FRESH game) ·
> Colton's 1.0 calls logged in vault CONTINUITY: Vault full-rework = a 1.0 requirement · shelf-first
> grind · seeded-RNG random primitive BLESSED (lane not yet built) · C2/C3 stay laptop/app-side.

## ✅ 2026-07-16 (evening) — HARVEST COMPLETE + v0.143.0 & v0.144.0 SHIPPED: 30.87% (+27), all 6 agent worktrees swept

> **The state**: census **10,547 of 34,161 (30.87%)** native+land (name-dedup; tally = tier-fingerprint
> rows matching `native*`+`land`, playable-pw excluded — reconciled against the prior 10,520 exactly).
> Suite **8,932 green** (717 files) · lint 0 · campaign total **+964** across 71 slices, LOST=0 on every
> audited flip-diff. **v0.143.0 SHIPPED** (Colton lifted the Vault taste-gate — the Vault heads into a
> full rework, so Phase 2 rode out as-is; release CI green, installer + .sig + latest.json verified on
> the GitHub release). **v0.144.0 tagged** with the harvest below.
>
> **THE HARVEST (the 3 in-flight Opus worktrees, per the wind-down protocol)** — every slice
> desk-audited line-by-line, full per-slice gate (suite exit 0 + lint 0 + flip-diff vs a fresh baseline,
> every GAINED audited by name), pushed serially:
> - **EC-1a** (7a97ad09, +1 committed-in-seat): aura-grant gate reads reminder-stripped oracle —
>   Oracle's Insight. Desk fix: cite 207.2c→207.2/207.2a (207.2c is ability words).
> - **EC-1b** (d0135508, +3 committed-in-seat): lifegain-scaled self counters (Sunbond / Light of
>   Promise / Ageless Entity) — the event-specific sentinel discipline; cites 603.2/119.3 verified.
> - **GC-1** (e6a1780e, +5, finished at the desk from the seat's uncommitted diff + test file):
>   Gustcloak becomes-blocked escape — untap + remove-from-combat atom; attacker record dropped,
>   blockers stay and assign nothing (CR 506.4/510.1d). Desk fix: cite 701.15a→701.19 (goad ≠ regen).
> - **EC-1c** (2ab88eb8, **+14**, finished at the desk — the seat left machinery, no tests): the bare
>   CONTROLLER edict "sacrifice a creature" (CR 109.5/701.21a) through the shared sacrifice chain —
>   Inevitable End's granted upkeep edict, the α2 reflexive pair (Shrapnel Slinger / Unscrupulous
>   Contractor — decline skips the reflexiveGate payoff, pinned live), Desecration Elemental's
>   any-player cast scope, Smothering Abomination's edict-feeds-own-draw. Also fixed the seat's missed
>   third stale boundary pin (parser.test.js MUST-DROP).
> - **MF-1** (51822a6d, +4, finished at the desk — machinery, no tests): Mana Flare all-players
>   same-type land-tap augment (Mana Flare / Heartbeat of Spring / Zhur-Taa Ancient / Dictate of
>   Karametra) — allPlayers battlefield scan + sameAsProduced bonus bound to the primary color (one
>   dual tap = WW or UU, never W+U). Desk fix: cite 613→106.1b.
> - **SP-1 (sliver interiors) and TS-1 (enchanted-land discard-cost activations) were NEVER STARTED
>   in their seats — returned to the frontier.**
>
> **Worktrees**: all 6 agent trees removed (3 dead Fable, fully harvested earlier; 3 Opus, harvested
> above). Remaining trees are the desk (cindy) + Omnath's — not build seats.
>
> **NEXT**: the remaining frontier is unchanged from the wind-down entry below MINUS GC-1/MF-1, PLUS
> SP-1 + TS-1 returned. The 1.0 roadmap conversation with Colton is OPEN (his call, evening 07-16:
> harvest first, then talk out the path-to-1v0 queue — C1 status vs the 07-15 B1-B4 ship, C2's
> app-required check, the Vault full-rework re-scope of C5).

## 🌙 2026-07-16 (day 2, WOUND DOWN ~20:00) — HANDOFF (superseded — harvest complete above): 30.8%, campaign +937, 66 slices, LOST=0 — 3 Opus worktrees IN FLIGHT

> **The state**: census **10,520 of 34,161 (30.80%)** native+land (name-dedup, the tier-fingerprint is
> the tally authority — generate a FRESH baseline before any new slice; session scratchpad files are
> gone). Master tip **eef29c12**; suite green + lint 0 at tip; NO release tag (the unreleased train
> still carries the far-from-ready Vault UI — unchanged). Day 2 total: +937 campaign, 66 slices, LOST=0
> on every flip-diff, every slice gated (suite exit VERIFIED before commit + lint + audited flip-diff).
>
> **HARVEST FIRST — three OPUS agents were mid-lane at wind-down.** Their commits (if finished) sit in
> their worktrees; none can push. For each: `git -C <path> log --oneline -5` — any feat(engine) commit
> above the branch base is deliverable. Cherry-pick into the build tree, AUDIT THE DIFF YOURSELF, then
> the full per-slice gate at the desk (suite exit 0 + lint exit 0 + flip-diff vs a fresh baseline with
> every GAINED audited by name, LOST=0) before pushing serially:
> - `C:\Projects\mtg-tool\.claude\worktrees\agent-ab239de3af440ff66` — **EC-1** the 19-carrier
>   enchant-creature interior sweep (its park map is the batch-6 planning artifact — capture it from
>   the commit body / test file even if the yield is small)
> - `C:\Projects\mtg-tool\.claude\worktrees\agent-af9c51fa1611291e8` — **MF-1** Mana Flare (via the
>   manaMultiplier machinery) + **SP-1** sliver interiors
> - `C:\Projects\mtg-tool\.claude\worktrees\agent-a83f560f46f0276d1` — **GC-1** Gustcloak escape
>   (combat-state surgery — park-prone, audit hard) + **TS-1** enchanted-land discard-cost activations
> The three DEAD Fable worktrees (agent-a9051935634e9b54a / agent-a559ab0e57185554d /
> agent-a19965a385e2da5d7) are FULLY harvested — safe to `git worktree remove --force`.
>
> **The working model (Colton's standing order, evening of 07-16)**: the DIRECTOR runs a team of three
> build agents (Opus seats; worktree isolation; they build + gate locally and NEVER push) and
> personally audits every diff, re-runs the full gate against the live census, integrates serially,
> pushes `git push origin HEAD:master`, and refills seats immediately — plus solo slices on
> non-contested files between integrations. Uninterrupted, no check-ins, no release tag. Known seat
> mechanics: agents junction node_modules via PowerShell New-Item (Git Bash mklink mangles the target);
> probes run from app/ with MTG_APP_ROOT="C:/Projects/mtg-tool/app"; briefs carry the CREED + workflow
> + park-with-evidence license; expect and welcome brief corrections from probes.
>
> **The remaining frontier (post-batch-5)**: the backgrounds' 16 unmodelable bodies · enchant-land
> interiors 6 (mostly parked with reasons) · Zelyon Sword 4 · block-additional 3 · copy-with-ability 3
> (Gigantoplasm, heavy) · random-discard 3 (HOUSE POLICY — needs Colton's call on a random primitive) ·
> suspend/trample-tail 5 · soulbond 24 (pairing subsystem) · banding 7 · the sub-2 singles trunk ·
> Declare Dominance's it-anaphor lure fold (combat.js pump rider) · Roar of Challenge's Ferocious
> rider · Geralf's Masterpiece's hand-scaled stat · Kormus Bell's layer-5 color delivery.

## ⚙️ 2026-07-16 (day 2, RUNNING) — **30.8%, campaign +937**: 66 slices, LOST=0 — OPUS batch 4 landed whole (+37)

> Census **10,520 of 34,161 (30.80%)**, baseline scratchpad cand79.txt. The Opus fleet's first full
> batch, every gate reproduced at the director's desk: **RT-1** RIOT (a115996a, +7 — modeled end-to-end
> at the entry chokepoint with a documented deterministic counter-vs-haste policy; the layer-6 haste
> grant over raw summoningSick) · **DV-1** DEVOID (711ad664, +8 — the agent's probe REFUTED the brief's
> hypothesized color bug: Scryfall bakes colors:[] into devoid cards and both derivation chokepoints
> read it; the real gap was the spell credit — the CDA line now strips like storm, plus a zero-cost
> hardening guard; Complete Disregard's pin lifted in-lane) · **BB-1** the same-name mass pump
> (330540d1, +3 — Bile Blight / Echoing Decay / Echoing Courage, the buff twin included on pure
> vocabulary) · **AF-2** AFTERLIFE (50963e3c, +7 — the dies→N-Spirits synthesis, salvaged partial diff
> evaluated and reused; tokens enter under the DYING creature's controller, pinned) · **MN-1** MENTOR
> (4e644eed, +8 — a new powerVsSource dynamic restriction, layer-aware, FAIL-CLOSED; equal power
> excluded, mentor-alone fires nothing, the own-intent chooser as a second net) · plus the director's
> **LU-2** this-turn lure (02f08256, +4 — Alluring Scent kin + Mortipede's activated self form on the
> FOG-latch marker; Declare Dominance's it-anaphor and Roar of Challenge's rider parked).
> Batch 5 out: EC-1 the 19-carrier enchant-creature interior sweep (the batch-planning artifact) ·
> MF-1 Mana Flare via the manaMultiplier machinery + SP-1 sliver interiors · GC-1 the Gustcloak
> combat-surgery escape + TS-1 the enchanted-land discard-cost activations.

## (superseded same-day) — 30.7%, campaign +900: the limit-restart entry

> Census **10,483 of 34,161 (30.69%)** — campaign +900 exactly. The session limit hit mid-batch-4
> (~17:45, reset 18:50); all three Fable agents died mid-lane. Post-reset salvage: **LU-1** LURE
> (0f03aa80, +6 — the long-parked block-requirements lane shipped at the MUST-ATTACK bar: opponentAI.
> pickBlockers force-assigns every legal blocker of a lured attacker; Taunting Elf / Elvish Bard /
> Ochran Assassin / Prized Unicorn / Breaker of Armies / Treeshaker Chimera; the this-turn/targeted/
> "it" variants all pinned off the anchor) — gated pre-limit, committed post-reset · **MA-1** the
> madness AURAS (3c40b189, +3 — harvested COMMITTED from the dead static seat's worktree, re-gated
> whole at the director's desk: Senseless Rage / Strength of Isolation / Strength of Lunacy via the
> FA-1-precedent auraResidueClauses admission on MD-1's rationale).
> Batch 4 RELAUNCHED on OPUS seats (Colton's call — Fable budget to the director): AF-2 afterlife +
> MN-1 mentor (with the dead seat's partial diff as reference) · DV-1 devoid correctness-first +
> BB-1 same-name debuff · RT-1 riot. The combat seat's dead AF-2 work and the zones seat's DV-1
> probes were captured before relaunch; MA-1's worktree commit was the only finished piece.

> Census **10,474 of 34,161 (30.66%)**, baseline scratchpad cand71.txt. This cycle: director solos —
> **TD-1** the tapped-count draw (0c6a5761, +2, Theft of Dreams kin) · **GR-1** the discard-N graveyard
> recursion (4a9ffb3b, +3, Stitchwing Skaab kin — the sacCount slice discipline for multi-victim costs)
> · **MD-1** MADNESS credited on permanents (6b23d689, **+18** — the ninjutsu/morph rationale + the
> spell path's versioned strip; Gorgon Recluse lifted DG-1's park; the 3 madness AURAS queued to the
> static seat). Team batch 3 — combat seat: **BT-2** the basilisk siblings (7d199925, +6 — non-Wall trio
> with the changeling-IS-a-Wall pin, bare pair, Abomination) · **CT-1** becomes-blocked-by-a-creature
> self-pumps (b4dc5792, +5 — a DEDICATED CR 509.3d per-blocker event, deliberately un-deduped vs 509.3c;
> Retaliation rides the group grant) — zones seat: **LT-1** land tuck (742c6200, +3) · **PX-1**
> power-filtered exile both directions (215a0307, +7 — probe corrected the brief: N=3, ≥ evidenced; four
> modal charms complete) · **GS-1** the gy shuffle-in (1b5c0d8f, +6 — dependent enumeration BY
> CONSTRUCTION, the unconditional-shuffle CR 701.24 pin) — static seat: **NV-1** mass land animation
> (5acfe069, +2 — dynamic layer-4 + 7b with a recursion-free type-identity branch + summoningSickNow
> enforcement; Kormus Bell parked on layer-5 color delivery) · **SU-1** single-target base-P/T set
> (50c7c980, +4 — Diminish/Square Up + two modal completions; counters-on-top-of-base pinned).
>
> Batch 4 out: combat seat — AF-2 afterlife (11) / MN-1 mentor (20) · static seat — MA-1 the madness
> auras (+3) / RT-1 riot (13, documented auto-pick policy) · zones seat — DV-1 the devoid
> correctness-first probe / BB-1 the same-name mass debuff.

## (superseded same-day) — 30.5%, campaign +835: 47 slices — TEAM batch 2

> Census **10,418 of 34,161 (30.50%)**, baseline scratchpad cand61.txt. Batch 2 (+18 team, +4 director):
> **XT-1** EXTRA TURNS, director solo (6dea9f58, +4) — Time Walk / Temporal Manipulation / Capture of
> Jingzhou / Second Chance; a CR 500.7 LIFO stack popped at advanceStep's end-of-turn branch ·
> **DG-1** the basilisk-touch delayed destroy (3f47ba5c, +2) — Deathgazer/Dread Specter; the engine's
> FIRST end-of-combat queue (turn-stamped, stale-dropped, drained after the last damage sub-step; the
> agent corrected the brief — first-strike sub-steps DO exist), destroys via the shared primitive so
> indestructible/regen/shields behave; Gorgon parked on the madness-permanent policy gap ·
> **AR-1** GY-TO-BOTTOM (0ade8b82, +9 — the probe found 14 carriers, not 3): Cogwork Archivist kin +
> Junktroller/Reito pair/Grazing Kelpie/Hoverstone/Chandelier; plus a REAL side-correctness catch —
> atomTargetIntent now reports anyGraveyard returns "ambiguous" so the Nantuko Tracer ETB class stays
> off the side-blind flush · **BW-1** the triple destroy/exile union (1a95b86d, +7) — Broken Wings kin
> + Shoot Down's exile twin + VIVIEN REID goes native-planeswalker (her −3 was the last unmodeled
> loyalty ability); layer-aware flying on the creature arm only · **BG-2** a REPAIR lane (39d3cc05, +0
> by construction): the agent's probe overturned the director's brief (the Background selector was
> BG-1's, already banked) and instead found TWO live CREED defects on claimed-native Candlekeep Sage —
> the granted leave-half never fired (dynamic dead-look-back added) and the granter phantom-drew off
> its own quoted text (quote-mask on the compound splitter + counter, one mask no drift).
>
> Batch 3 out: zones seat — LT-1 land tuck / PX-1 power-capped exile / GS-1 gy shuffle-in · static
> seat — NV-1 Nature's Revolt mass land animation / SU-1 Diminish base-P/T · combat seat — BT-2 the
> contact siblings (non-Wall trio, bare pair, Abomination) / CT-1 the becomes-blocked self-pumps.

## (superseded same-day) — 30.4%, campaign +813: 42 slices — the TEAM's first batch

> Census **10,396 of 34,161 (30.43%)**, baseline scratchpad cand56.txt. Colton's order (evening): three
> Fable build agents under the director (me) — isolated worktrees, local gates, NONE push; every diff is
> audited at the director's desk, re-gated against the live census, integrated serially to master.
>
> **TEAM BATCH 1 — all three landed, +13**: **MG-1** the modal shared-type graveyard pair (1d1583a1, +3)
> — Return from Extinction / Raise the Draugr / Unbury; the sharesCreatureType subset constraint runs
> through a CR 205.3m ALLOWLIST (a bare after-dash intersection would certify Gingerbrute "Food" shares —
> the agent caught it), DFC front-face split, Time Lord bigram, changeling unconstrained ·
> **FT-1** the Falter-class mass block lock (f67d9447, +7) — ONE dynamic-selector layer-6 endOfTurn
> cantBlock rule (CR 611.2c rules-modification license verified); withoutKeyword joins WD-1's withKeyword
> with the shared re-entry guard; Falter / Magmatic Chasm / Seismic Stomp / Fire of Orthanc / Tectonic
> Rift / Destructive Tampering / Seismic Elemental; parked-with-evidence: opponent-scoped (no resolution-
> controller plumbing), color-pair (selector colors not layer-5-aware — refused the half-enforcement) ·
> **NR-1** the artifact activation lock (da0ee5fa, +3) — Null Rod / Stony Silence / Collector Ouphe;
> SIX enumeration sites gated on one reader (manaSources the affordability/payment chokepoint, tap-for-
> mana, double-mana-pool, activate-ability incl. granted+equip, crew CR 702.122a, loyalty), layer-aware
> Artifact reads, cycling/gy-zone correctly NOT locked (CR 109.2).
>
> BATCH 2 out: **AR-1** gy-to-bottom (Cogwork Archivist kin) + **BW-1** the Broken Wings triple union
> (one seat) · **BG-2** the Background family ("Commander creatures you own have «…»" — 26 carriers,
> 6 bodies pass today's validators; the selector is the lock) · **DG-1** the basilisk-touch delayed
> destroy (Deathgazer kin — needs the first end-of-combat queue; park-if-dirty clause).
>
> Post-30% solo slices since the last entry: **TG-1** UNTIL-EOT QUOTED GRANTS (4a928a44, +12) — the
> Feign Death machinery: one fixed-ids layer-6 addAbility vehicle (CR 611.2c set-lock) riding the
> existing group-grant collectors both halves (triggered fire incl. a dead-look-back dies path;
> activated enumeration), body-gated by the SAME validators the static group grants use; the
> [dies-return-bf] sentinel keeps the bare wording off the FLICKER spell half (Momentary Blink pinned
> Arbiter); Feign Death / Undying Malice / Showstopper / Lightning Volley / Resuscitate / both Helixes
> live; one graduated pin (enduringGlimmer's bare-return guard now owns only the no-type-strip boundary)
> · **WD-1** the WITH-FLYING anthem (c748f21f, +7) — parseCreatureSelector withKeyword + a layer-aware
> matchesSelector gate with a re-entry guard; Favorable Winds, Empyrean Eagle, Thunderclap Wyvern,
> Cynette, Air Nomad Legacy · **LG-1** the SPLIT-DAMAGE pair (9d2db72f, +4) — one normalize rewrite,
> zero new atoms; Lunge / Hungry Flames / Shower of Sparks / Cunning Strike; the Assembled Alphas
> trigger tail and the X form pinned off the rewrite.

> Census **10,360 of 34,161 (30.33%)**, baseline scratchpad cand50.txt. Post-30% slices:
> **FA-1/AB-1** (a6546592, +31) — FLASH admitted as aura residue (26 flash auras cascade: Rancor-kin
> timing was never a modeling gap, just an unadmitted clause) + the type-conditional unblockable
> gate (artifact/enchantment/untapped-land defender checks in canBlockAttacker) ·
> **SL-1** the dealt-by lifegain links (5f0edf91, +12) — "Whenever this creature deals [combat]
> damage, you gain that much life": a new dealtBy event fired with per-source totals at BOTH damage
> paths (CR 510.2 combat totals; per-resolution spell totals), the ATTACHED form gaining for the
> AURA's controller (Spirit Link on their fatty feeds YOU), combat-only honored, "dealtBy" admitted
> to the combatDamageAmount referent gate, and isNativeAura widened so a TRIGGER-ONLY aura (Spirit
> Link / Spirit Loop / Vampiric Link — no bonus line) qualifies. Zebra Unicorn, Armadillo Cloak,
> Exalted Angel, Sunhome Enforcer live. Suite 8,682 green · lint 0. Housekeeping: app/data/self-play/
> (the crucible harness's local logs) gitignored — a day's batch nearly rode into the SL-1 commit.

> **DC-1, the Discard-a-card cost (84d200f2, +96)** — the single biggest slice of the campaign took the
> census from 10,221 to **10,317 (30.2% of 34,161)**, straight through the 10,248 line. One cost-vocabulary
> entry (γ1h + the per-distinct-hand-card offer + the pay-before-stack dispatch) unlocked the looter
> class, the madness enablers, YAWGMOTH THRAN PHYSICIAN, Trading Post, The Underworld Cookbook, and
> brought the Immobilizing Ink granted family back from its UT-1 eviction with real runtime. Six pins
> graduated — every one had used the discard cost as its canonical unmodeled example. Suite 8,676 green.

> Latest: **SC-1** cant-be-blocked SELF + the life-comparison intervening-if (16d80461, +15) — the
> unblockable-activation class (Gearseeker Serpent kin) + Sword Coast Sailor; the Tar Pit pin caught a
> real layer-blindness in selfTargets (now permanentIsCreature-aware) · **the JB-1 widening**
> (14cf09a0, +1) — "this PERMANENT deals N damage to you" → Plague Sliver's group drain flips.
> The exact-30% line (10,248) is 27 cards out; baseline scratchpad cand46.txt (10,221).
>
> ENCHANT-LAND SEVEN probed and PARKED with reasons: Chamber (control-until-EOT duration unmodeled) ·
> Farmstead (upkeep pay-offer) · Equinox (conditional counter) · Urban Burgeoning (other-players'
> untap-step modifier) · Tin Street Market + friends (the "{T}, Discard a card:" COST — a cost-vocabulary
> + activation-pause extension, the likeliest medium build next) · Animal Boneyard (sac cost + dynamic
> toughness lifegain). Sunken Field already native. The big remaining machinery lanes: until-EOT quoted
> TEMP-GRANTS (13 across three tails — needs a grant-vehicle continuous effect + enumeration read) and
> the 20 enchant-creature grant interiors (one-by-one).

> **THE +600 MILESTONE**: campaign native+land 9,583 → 10,200 name-dedup (~29.9% of 34,161 — one slice
> from 30%). Latest: **LV-1** the leavesSelf event + the LTB disjunction (a4b8c521, +20) — THRAGTUSK
> lives (any-exit LTB, bounce included); the fading/vanishing phantom-reminder strip un-parked every
> vanishing+trigger card (Aven Riftwatcher, Keldon Marauders); Illusions AND Delusions of Grandeur ·
> **OD-1** the opponent-debuff anthem (c7ca39c0, +5) — ELESH NORN, GRAND CENOBITE both-sides native.
> Latest: **KM-1** Kismet imposition (61024daf, +3) · **GX-1** up-to-three single-graveyard exile
> (7fc54227, +6) · **TW-1** the whole-hand cycle (260db308, +3) — Tolarian Winds as ONE composite atom,
> disarming the bare "draw that many cards" combat-damage mis-bind for the known wordings · **BC-1**
> KW-BATTLE CRY (2323c7d7, +7) — per-instance attacks synthesis over the Trumpet-Blast scope with
> excludeSource · **AF-1** the aura-own activated pump (a2f11b6f, +9) — Armor of Faith compounds +
> Firebreathing kin via the injected aura-own-activated validator (the PZ-1 pattern).
>
> PARKED WITH REASONS: bloodrush (needs a combat-step activation window the engine's action surface
> lacks — native-but-unusable would be an FP by uselessness) · block-additional (the multi-block
> damage-DIVISION choice is unmodeled — an over-deal trap) · lure (needs a block-requirements
> subsystem; half-enforcement = FP) · (SC-1 SHIPPED 16d80461 — see the top entry) · "sac unless
> discard at random" (needs a random primitive — check house policy). FRESH FRONTIER
> (post-31-slice census): enchant-creature grant interiors 20 ·
> backgrounds 17 · enchant-land interiors 7 · slivers 6 · until-EOT +N/+N-and-gains quoted grants 5 ·
> the "trample-tail" suspend carriers 5 · until-EOT team/target quoted grants 4+4 · lure 4 · Zelyon
> Sword 4 — the ≥3 trunk is long-tail interiors + temp-grant machinery from here. Baseline tier file:
> scratchpad cand43.txt (10,205 native+land names, ~29.9%; the exact-30% line is 10,248).

> Numbers audited against the tier-census files (9,791 → 10,152 name-dedup native+land, ~29.7% of
> 34,161): the running "+358/20 slices" line pushed earlier in the day OVER-COUNTED by a drifted slice
> tally — the census delta is authoritative. (The ledger doesn't care how ya feel.)
>
> Post-correction slices, each gated + audited + pushed: **PS-1** KW-PERSIST (a11e1eb4, +12) — undying's
> -1/-1 mirror + the immediate 0/0 SBA; Kitchen Finks / Glen Elendra / Woodfall Primus live · **RL-1**
> the one-spell-per-turn law (1a2c5757, +4) — Rule of Law rides the existing cantCast gate ·
> **AT-1** the ATTACKING anthem (25ed02ff, +13) — a real combat-state selector in layers; both
> Oriflammes, War Horn, Berserkers' Onslaught, Windbrisk Raptor. Suite at 8,658 · lint 0 throughout.

Colton's standing order (morning): the Vault walk became a future full overhaul (parked); the corpus
grind resumes uninterrupted — full trust, no check-ins. Day-2 slices, each gated (suite+lint+audited
flip-diff) and pushed: **GY-2** exile-cost graveyard abilities, Seasoned Pyromancer frame (588487ce,
+17) · **AC-1** compound pump+grant attachments, Deviant Glee/Mortarpod (ea4920c9, +12) · **LA-1**
aura-own ETB riders, Gift of Paradise/Abundant Growth (fb29da9d, +6) · **PV-1** PREVENTION SHIELDS
(CR 615), the Samite Healer/Bandage system — floating this-turn shields consumed at BOTH damage paths,
lifelink-honest in combat (ff9cea09, +43) · **FOG-1b** players-only fog + self prevent-all walls,
integrated with the incumbent fog op after the suite caught my duplicate (d50bde1e, +6) · **AP-1**
attached prevention walls, Gaseous Form/Defang — the reader lives in staticAbilityParser so the aura
CAST gate and the metric can't drift (368951e4, +8) · **PZ-1** the Paralyze-class attached tap-lock +
aura-own-ETB validator (6cd9013d, +42) — PLUS the HARDENING: auraTouchClausesAllModeled caught the
Bind-the-Monster shape (a pronoun follow-up sentence riding the runtime descriptor while the touch
heuristic ate it — 7 would-be FPs evicted pre-commit, and it retro-caught AP-1's Candletrap classify
hole) · **UT-1** the untap-self atom (2f847746, +28) — one anchor, three families: the tap-lock
escape grants (Singing Bell Strike returns WITH runtime support), printed untappers (Morphling wakes
up), cast/ETB-watcher self-untap triggers (Thermo-Alchemist) · **DT-1** the DETAIN frame (c2eb4906,
+26) — "exile … until this <word> leaves the battlefield" (Banishing Light / Banisher Priest / Seal
Away / Trapjaw's enrage): linked exile on the source permanent, [detain-return] one-shot on ANY exit,
CR 610.3b + token-vanish guards, v1 aura exclusion at enumeration · **VH-1** CREW (f1c8c74f, +40) —
Vehicles animate: actionsCrewVehicle (sick-first auto tap-set) + a layer-4 endOfTurn type-add +
CR 302.6 same-turn sickness + the classify crew-line strip (audit catch: the first strip regex ate
Imposter Mech's clone rider — re-anchored line-start) · **OR-1** the attacks-or-blocks disjunction
split (159536b6, +8) — both halves fire; Smuggler's Copter crews AND loots (a same-day VH-1+OR-1
compound flip) · **TP-1** the tap-freeze fold (f893ae90, +7) — Frost Breath class, the plural Junk
Winder fold · **SM-2** can't attack or block alone (f7b533b4, +5) — Mogg Flunkies at both declare
gates · **TE-1** assign-as-unblocked (053ec13a, +8) — Thorn Elemental's full power through blockers ·
**BF-1** the blocks-a-flyer pump (cf0df1af, +6) — Netcaster Spider, the rampage fire-time family ·
**EC-1** KW-ECHO (5b063ead, +37) — the one-time first-upkeep pay-or-sacrifice on the cumulative-upkeep
chassis; Karmic Guide / Avalanche Riders / Goblin Marshal ride their already-modeled ETBs · **FL-1**
KW-FLANKING (5958b217 + the 936598d4 pin graduation — A GATE SLIP is on record in that commit: the
FL-1 push carried one red pin because commit+push were chained behind the suite in one shell command;
discipline since: gate exit verified BEFORE any commit) · **IE-1** contact damage (c44c4cb5, +4) —
Inferno Elemental per block pair, both roles; the audit caught two rider-eating FPs (Assembled
Alphas / Sawtooth Ogre) pre-commit and the regexes are sentence-end anchored · **JB-1** the BITE
union + upkeep self-drain (21948f30, +15) — Bite Down's creature-or-planeswalker dealee via the pw
damage path; Juzám Djinn's "deals 1 damage to you" as REAL controller damage. Suite 8,588 → 8,650 ·
lint 0 throughout · NO release tag (the unreleased train now carries C5 + both blitz days).
Prevention is now a real subsystem: next-N shields, fogs (all + players scopes), self walls,
attached walls — each new prevention wording from here is a clause, not a build. Running census after
day-2 so far: native+land 9,791 → 10,123 by name-dedup (~29.6% of 34,161).

## 🌙 2026-07-16 (overnight) — THE CORPUS BLITZ: +208 audited native adds, 14 slices, LOST=0 everywhere

**The one-night autonomous order ([[overnight-corpus-blitz-2026-07-16]], now archived) ran 01:00–03:30.**

### 1 · THE HEADLINE
**Corpus native: 28.05% → 28.7%** (tier-fingerprint name-dedup 9,583 → 9,791 = **+208 audited GAINED,
LOST=0 on every slice**; measure-coverage headline 9,798/34,196). Suite **8,519 → 8,588** (+69 tests) ·
lint 0 throughout · every push individually gated green. Data root: the fresh 2026-07-15 Scryfall
snapshot (main tree), before/after measured against the same root. NO release tag (the order's hard
bound — C5's taste walk is still the open gate).

Slices shipped (each: flip-diff audited by name · full suite · lint 0 · pushed):
- **TM-1** fixed-amount targeted mill (da30e80f) — **+46** (incl. Jace Beleren → native-planeswalker)
- **TUT-1** fixed-MV battlefield tutors, the Rebel/Mercenary chains + Zur (e7d64e88) — **+20**
- **BG-1** commander-qualified group selector, Backgrounds + Bastion Protector (5890e7ff) — **+7**
- **SS-1** KW-soulshift, keyword→trigger synthesis + subtype+MV gy filter (d939192f) — **+19**
- **CS-1** counter riders: soft+exile-instead (Syncopate) + the mill rider (51800d9d) — **+6**
- **SM-1** islandhome attack restriction, per-defender gate (2fc1c6ef) — **+12**
- **GT-1** power-capped cant-be-blocked, Goblin Tunneler class (7365980c) — **+11**
- **OA-1+RE-1** self-hit damage + per-blocker pump (e0e67f20) — **+15**
- **PA-1** the Pacifism class, attached can't-attack/block (39899c62) — **+6**
- **ONCE-1** "Activate only once each turn" ledger, the Rootwalla frame (08975c7f) — **+31**
- **EX-1** KW-exalted, the attacks-alone fire (e333de59) — **+22**
- **GY-1** graveyard-activated self-recursion, the engine's first gy-zone ability (99edc84a) — **+10**
- **DT-1** "During your turn" gated self-buff (8738c917) — **+3**
- Chores: card-names.json refresh committed (78da0245) · slice manifest regenerated (867cef4a).

### 2 · PLAY-WEIGHTED LENSES (before → after)
top-1k **67.1 → 67.4%** · top-2.5k **48.7 → 48.9%** · top-5k **37.9 → 38.2%** · top-10k **30.3 → 30.6%**.

### 3 · ARBITER-ROUTED / HONESTLY-HELD (each verified still-gated, with its blocker)
- **General Marhault Elsdragon · Berserk Murlodont** — GROUP per-blocker-pump watchers; the runtime fire
  reads the blocked attacker's own card, so a group form would pump on the wrong scope. Needs a
  group-watcher fire lane.
- **Lin Sivvi, Defiant Hero** — {X}-cost activated recruiting (the activated-X tutor lane is unbuilt).
- **Woodland Bellower** (nonlegendary+color tutor filter) · **Guardian Sunmare** (nonland filter + saddle).
- **Soul of Mirrodin** — its second ability activates from the graveyard with an EXILE-self cost
  (GY-1 modeled the mana-only return shape; the cost-zone-exile shape is the natural GY-2).
- **Captain America, Liberator** — the for-each-Equipment token attack trigger.
- **Arrest** — the compound "…and its activated abilities can't be activated" tail (PA-1 took the clean class).
- **The two-line sea monsters** (Sea Serpent, Dandân, Bog Serpent, Gorilla Pack…) — "When you control no
  Islands, sacrifice…" is an unmodeled STATE trigger; SM-1 took the one-line class.
- **The Backgrounds with unmodeled interiors** (Inspiring Leader's quoted static anthem, Scion of
  Halaster's replacement, the attacks-a-player intervening-if family) — BG-1's selector waits under them;
  each interior that ever parses flips its card for free.
- **The healer class** ("{T}: Prevent the next N damage…", 9 cards) — needs a prevention-shield system
  (floating replacement with a decrementing counter). The biggest named leave-behind.
- **"Activate only twice each turn"** — the ONCE-1 ledger counts one activation; a counted variant is a
  small extension.

### 4 · ☀️ DECISIONS I MADE FOR YOU (one line each)
- The main tree's dirty `card-names.json` was a REAL data refresh (Scryfall 07-15) — committed, not reverted.
- Slice manifest regenerated against v0.142.0 + fresh data and committed as the night's map.
- Per-slice proof = the order's own 3-part law (suite + lint + name-audited flip-diff); the deeper
  program/runtime fingerprints were reserved for parser-seam-only changes (none tonight qualified).
- The trajectory-hash anchor is UNRUNNABLE on this box (no profile decks in the main tree — the app isn't
  installed here); the suite's determinism pins carried behavior coverage. Flagged, not silently skipped.
- BG-1 models "commander creatures you OWN" as controller-scoped — an engine invariant (no native
  control-theft, no owner field); documented at the parse site with a revisit marker.
- OA-1/RE-1 + PA-1 rode one gate and one push (the intermediate commit was never pushed alone).
- No release tag, per the order — see NEEDS COLTON.

### 5 · ☀️ NEEDS COLTON (ranked)
1. **The C5 taste walk** (carried) — and with it the release call: tonight's +208 rides the same
   unreleased train as the Vault Phase 2 + Crucible batch. One walk → one fat release.
2. **Rograkh in the grind pool?** (carried from 07-15.)
3. **Real Omnath-deck reconciliation** (Newt→Last March — dev copy done, your AppData deck awaits you).
4. **Golden-hands review** (120 mulligan hands, ~20 min, carried).

### 6 · PARKED WITH ANALYSIS (the written next step for each)
- **Prevention shields (healers, 9)** — design: a `preventNextDamage` floating replacement keyed
  source→target-scope with an amount counter, consulted at the damage chokepoint; AI value is low but
  legality is what matters. Medium build.
- **GY-2 (exile-self-cost graveyard abilities)** — extend parseGraveyardSelfRecursion's cost grammar +
  the dispatcher's cost items; Soul of Mirrodin + siblings flip.
- **Group per-blocker watchers (Marhault)** — a `perBlockerPumpGroup` descriptor whose fire loop scans
  the CONTROLLER's watchers per blocked attacker; reuse RE-1's amount math.
- **Aura compound "gets +N/+N and has '<activated>'"** (Lunarch Mantle class, 8) — parseAttachedClause
  already folds quoted-TRIGGERED tails; the quoted-ACTIVATED fold + grantedActivatedForHost surfacing is
  the missing half.
- **Enchant-land quoted grants** (Farmstead/Urban Burgeoning class, 8) — the granted-ability machinery
  wants a land-host acceptance pass.

### 7 · THE SELF-ASSESSMENT (the real read, not a highlight reel)
**What worked:** recon-instruments-first (clause-frontier + the family probe) made every slice
evidence-picked — the manifest's static priors would have sent me at cumulative upkeep (already built,
a mirage) and underweighted the Rootwalla frame (+31 from a bucket the ladder never named). The
audit-every-GAINED-row law caught TWO real would-be FP classes before they shipped (RE-1's group-scope
regex — Marhault would have pumped the wrong creature — and the OA/RE double-descriptor twin). The
CREED pins did their job in reverse too: five stale must-stay-LOW pins graduated tonight, each
repointed at a still-unmodeled example rather than deleted.
**What I'd do differently:** (1) the BG-1 commit message states suite 8,556 — the true count was 8,546;
caught one commit later, correction recorded here and in SS-1's message (can't amend a pushed commit).
(2) Two early gate runs piped through `tail`, which masked exit codes — one suite failure surfaced a
run later than it should have; switched to explicit exit-code capture mid-night. (3) One gate ran while
I was mid-edit on the next slice, making its verdict ambiguous — re-gated the final tree and pushed both
commits under the one verified state; cleaner is to not touch the tree while a gate runs. (4) I spent
~25 minutes on cumulative upkeep before probing whether it was already built — probe FIRST, always.

**Carried items unchanged:** Feature B (Omnath's persona narration) · the mirrored-pod targeting
re-anchor (needs scheduling) · everything in §5.

## 🏛️ 2026-07-15 (night) — VAULT PHASE 2 COMPLETE on master: C5 is DONE end-to-end (awaiting Colton's taste walk)

Colton fired the parked C5 Phase-2 layout batch ("fire it up and let'er rip"). All five items
shipped in spec order, each suite-green + lint-0, then live-walked in the dev server (kiosk → Census
→ Stacks → overflow → shelf → trophy page → edit drawer → Gallery, driven via the accessibility tree;
seeded 2 stage-prop cards through the real API for the walk, deleted after):
- **P2.2 (ececb650):** Stacks header → Add + Import + ONE ⋯ overflow menu (reversible by design).
- **P2.3 (ba8a6d74):** Ledger split — finance stays; stats become **THE CENSUS** (kiosk 5→6 doors,
  live pane = biggest color share + unique count; tally-mark icon; area tagline updated).
- **P2.1 (2248e70e):** **THE SHOWPIECE SHELF** + elevated grid cells — provenance-flagged rows
  (signed/artistProof/altered/showcase) + top-5 by value (\$50 Finance grail floor) open The Stacks
  large under the glow; flagged grid cells get glow ring + ★ chip. Shared predicate:
  `app/src/lib/showpiece.js` (unit-tested).
- **P2.4 (1fe12c4e):** **VaultTrophyPage** — flagged cards open full-page (hero art, provenance
  plaque, worth + trend, copies, notes); "Edit details" opens the drawer BESIDE it; unflagged cards
  keep the drawer.
- **P2.5 (b493e9e4):** Gallery rides the shared CollectionView shell (embedded mode, no dup header).

Suite **8,519** (+20) · lint 0 · CHANGELOG [Unreleased] written. **OPEN for Colton: the C5 spec's
review gate — a packaged-UI taste walk (shelf + trophy page are taste features; expect one
adjustment round) → then cut the release.** Carried items unchanged: Rograkh in the pool? · real
Omnath-deck reconciliation · Feature B (Omnath) · mirror-targeting spec.

## 🚢 2026-07-15 (night, later) — v0.142.0 TAGGED (c08d8d09): the whole Crucible batch ships

Colton eyeballed and called it ("ship this is good"). One release: The Reflecting Pool R1-R4 +
Living History, ▶ watch-the-highlight, the A/B coverage trust banner, the grind-store guards.
Tag v0.142.0 pushed; CI release run 29469377709 was in progress at handoff — if it failed, fix and
re-tag per RELEASE.md before anything else. Remaining Colton/Omnath items unchanged from the entry
below (Rograkh? · real Omnath-deck reconciliation · Feature B · mirror-targeting spec).

## 🎬 2026-07-15 (night) — CRUCIBLE SWEEP COMPLETE: dream shelf A ✅ + C ✅ (B = Omnath's lane) · queue item ② closed · sim-integrity order closed · A/B trust gate live

Autonomous continuation (Colton's standing order: any Crucible-attached work, full auto). Shipped to
master, each suite-green + lint-0 + live-verified:
- **Feature C "▶ Watch it" (b0e22ea4):** game-anchored highlight facts re-run their exact game
  (deterministic seed-index replay, cross-checked vs the recorded row) → per-turn scrubber. New
  `engineLogNarrator.js` (engine log → honest plain-English play-by-play; reusable). perGame rows now
  record their SEED index (array position drifts on engine-throws — the replay anchor bug that never
  shipped).
- **A/B bench coverage trust gate (3748e0fc):** both swap cards classified at start
  (coverage.classifyCard); a not-fully-modeled card gets a plain banner framing the result as a
  partial read — "no effect" can no longer masquerade as a verdict (Omnath's Chronicle-of-Victory rule).
- **Grind-store double-writer guard (18d2b652):** wake-queue ② audited STALE (0 dupes in the live
  store AND the epoch-2 archive, both dense) + a permanent dedupe-on-read (last-line-wins) in
  readAllGrindHeaders.
- **Sim-integrity order effectively CLOSED (0de1d309):** Phases 0-3 verified shipped; the missing
  Phase-0 guard shipped as a formPod deck→seat uniformity tripwire (2,000 seeded pods, >4σ, 39ms).
  **⚠ ENGINE FINDING (banked, not fixed): mirrored pods pile onto early seats (0/5/14/41 @ n=60)** —
  attack-targeting heuristics; real-deck pods are FAIR (25.0/25.1/24.8/25.1 by position over 23,313
  games). Any mirror-based measurement (pilot A/B, temperament benches) is position-poisoned until a
  spec'd targeting fix — a RE-ANCHOR event, needs scheduling.
- Removed the committed scratch dump `after-clone2.txt` (4b2b61c6).

Suite **8,499** · lint 0 · master tip b0e22ea4 (+docs). **OPEN for Colton:** eyeball the Reflecting
Pool + the highlight replay → cut the release (one batch: R1-R4 + trust gate + ▶ Watch it) · Rograkh
in the grind pool? · real Omnath-deck reconciliation (Newt→Last March; the dev copy already matches).

## 🪞 2026-07-15 (later) — R4 THE LIVING HISTORY on master (600768d6): the Pool is COMPLETE R1-R4; combat-stamp finding RESOLVED (data age, not a bug)

R4 un-parked and finished per Colton's standing order (autonomous session — he authorized working
around parks). **mineDeckHistory** slices a deck's games into chronological eras by `decks[].deckV`;
the **deck-versions registry** (`<profile>/self-play/deck-versions.json`, written at grind start by
BOTH paths via grindPod.deckVersionEntry — the same hash fn as the header stamp) names each version's
exact list, so the dossier shows real card diffs ("+ Last March of the Ents · − Noxious Newt").
HONESTY IS STRUCTURAL: the pre-tracking era never anchors a comparison (mixed engines/pilots/stamps —
live probe proof: 'combat 0%→93%' was the STAMP era changing); deltas need 100 games both sides,
shifts 30-a-side + 5pt, and everything clears a two-proportion 2σ noise gate. UI: era timeline at the
dossier's foot, hidden under 2 eras.

**Combat-stamp finding RESOLVED:** fresh games stamp winCondition 24/24 'combat' — the mechanism
(loseLife combatDamage flag → lethalDamageCombat → epochStats) is live and correct; the 24k games
simply predate v0.140.0's split. Legacy 'damage' inflation self-heals as new-era games accrue.

**Dev-tree data note:** the worktree app/data copy grew to 25,334 headers (two 600-game pool batches:
pre-swap + post-swap) and its Omnath deck copy carries the Colton-sanctioned Newt→Last March swap
(matches his verified-100 target; his REAL AppData deck is untouched and still awaits his own
reconciliation). Suite **8,487** · lint 0 · walked live in-browser.

**OPEN:** Colton's dossier look-check → cut the release (his gate). The Rograkh-in-the-grind-pool
question is still his to answer.

## 🪞 2026-07-15 — THE REFLECTING POOL: R1-R3 on master (6c043009), UNRELEASED pending Colton's look-check

The Post-Mortem grew into **The Reflecting Pool** (Colton's locked name) — the per-deck review dossier:
record · facts row (typical game / wins-end-by / dies-around / usually-closes-by / commander-online) ·
two lift-mined mirrors (what WINS you games — new R1 win catalog — / what LOSES you games), deck-shelf
chips browsing one dossier at a time. Internal `postmortem` view id + `/api/why-you-lost` route kept.
**R3**: every new grind header stamps `decks[].deckV` (grindPod.deckVersionHash — sha1/12 exact-to-the-card
incl. basics/commanders/companion) via the ONE shared builder on both write paths; forward-only; R4
(living history) parks until versioned games accrue. Suite **8,475** · lint 0 · walked live on the real
24,102 headers (seeded read-only into the dev tree).

**Honesty catches off the real-data probe (both fixed pre-push):** the generic "damage" winCondition
topped EVERY deck's wins at 80-97% → excluded from win patterns (facts-row mix only, "damage / drains");
closed-fast threshold set from real p10 (32), not a guess.

**⚠️ QUEUE — engine finding:** combat wins ≈ ZERO across all 24,102 games (Slivers closes 80%
generic-"damage" + 20% commander-damage, ~0 combat — a Sliver deck cannot honestly do that).
`lethalByCombat` likely unstamped at (most) combat eliminations → everything falls to the generic
bucket. Root-cause before any surface leans on combat-vs-burn splits. Also open: Colton's dossier
look-check → cut the release.

## ⚡ 2026-07-10 (later) — THE SHELF RUN: PHASE 1 IN FLIGHT — 28 tier flips shipped (v0.128.0 → master), all audited, LOST 0

**Shipped slices (each: flip-diff audited by name · whole-card verified · suite green · lint 0 · pushed to master):**
- **S1.1** cast-program strip (Harmonized Crescendo recurrence — root cause: unstripped `action.program` short-circuited the dispatcher fallback) — runtime fix, 0 flips.
- **PtH + sequencing-Then strip** (`parser.js` per-sentence loop, CR 608.2c): **+5** — Plan the Heist (conditional surveil `onlyIfHandEmpty` + resolver gate), Deadly Embrace, The Crystal's Chosen, Undercity Uprising, Insidious Fungus.
- **W1 COUNTER-THEN-GRANT collapse** (Snakeskin Veil class; add-counter gains layer-6 `grantKeywords`): **+15** — incl. Angelfire Ignition, Gaea's Gift, Take Up the Shield, 2 modal + 2 trigger carriers.
- **W2 Ram Through** (damage-target-power + `trampleExcess` → excess to controller, CR 702.19b deathtouch math): **+1**.
- **W3 Ancient Animus** (fight-pair + `fighterCounter{onlyIfLegendary}`, persistent counter before power lock): **+1**.
- **W4 Paradise Mantle** (granted-mana EQUIPMENT — parse widening only; layers.js attachment path already fires for any attachedTo): **+1**.
- **M1a ONCE-PER-TURN TRIGGER latch** ("This ability triggers only once each turn." — strip + descriptor stamp + flushTriggers latch; COMPOUND GUARD keeps MACH-1 parked): **+3** — Mirelurk Queen, Academy Wall, Flying Octobot.
- **M1b milled-count tokens** (Scorchbeast: milled sentinel → `countContext` + create-token joins ONCE_PER_TURN_HONORED with a real resolver latch): **+1**.
- **M1c Mothman distribute** (each-of-up-to-X via distribute-counters + `perTargetCap:1`; 3 coverage spell-guards widened): **0 flips — runtime only**; Mothman tier stays parked on the "enters or attacks" compound-event guard (mothmanRad.js coordination note).
- **M2 MILL-DOUBLER** (Bruvac → doubler family; `millMultiplier` at BOTH chokepoints incl. radiation): **+1**.
Tests 8,078 → **8,108**. Census/corpus republish pending the next slice batch.

**⚠️ MID-FLIGHT (uncommitted in the worktree, safe-inert):** M3 Mindcrank life-loss watcher — `gameState.js` registry + loseLife hook (null-watcher = byte-identical) + `triggers.js` lifeLost condition detect are IN; still needed: `checkLifeLossTriggers` + `registerLifeLossWatcher` wiring, the "that player mills that many cards" payoff clause (who:lifeLostPlayer + countContext:lifeLostAmount in applyMill), referent gates (triggerRouting + coverage ×3), tests, flip-diff.

**☀️ FOR COLTON:**
- Named parks so far: Chain of Vapor (standing), MACH-1 (compound limiter — needs the shared-latch build), Emrakul the Promised End (control-a-turn, Yuriko ledger park-candidate). Sign-off when convenient; work continues.
- **EXE DECK-PROFILE ISSUE RECURRED** (your screenshot: your 6 decks listed under "Joe"): queued as a PERMANENT-FIX workflow item — see the queue below. Likely the updater-relaunch ghost-registry thread (COMMS 2026-07-09 evidence note) or a mis-attributed re-import while the ghost was active. Interim: tray-Quit → manual relaunch; deck data repair + root-cause scheduled.

**QUEUE (next up, in order):** ① Omnath's featuresV=2 header bundle (manaHealth per-seat units fix + startSeat/turnOrder + per-seat mulligan summary + decisionsCount) — header-derivation only, no re-anchor; ② double-writer dedupe/reconcile idx ~24230–24318 at pool end; ③ finish M3 Mindcrank; ④ EXE deck-profile permanent fix (data repair + updater-relaunch root-cause); ⑤ compound-event trigger subsystem (Grave Titan / Mothman / Alpha Deathclaw / Kindred Discovery — big corpus lever); ⑥ resume Phase-1 ledger builds (Mothman → Kellan → Wolverine → Yuriko → Cap, workflow-verified dispositions in `tasks/wlg0dw5cn.output` digest).

## ⚡ 2026-07-10 — THE SHELF RUN: PHASE 0 BASELINE PUBLISHED (all six deliverables)

**1 · FRESH 15-DECK CENSUS** (lands-in-denominator; engine v0.128.0): AGGREGATE **78%**
(1,173/1,500; was 73.9% floor). Per deck: Slivers 99 · Koma 94 · Omnath 94 · Vihaan 93 ·
Zaxara 93 · Toph 79 · Rograkh 77 · Ur-Dragon 75 · Kinnan 74 · Pantlaza 71 · Cap 70 ·
Yuriko 65 · Wolverine 64 · Kellan 63 · **Mothman 62 (new worst — evidence re-ranks the
roadmap's Wolverine-first order)**. Gap = 327 slots (235 body-only · 87 arbiter-spell · 5 pw).

**2 · THE ONE CORPUS DENOMINATOR (decided): all 34,169 real bundled oracle cards**
(isRealCard: tokens/emblems/schemes/etc. excluded — the measure-coverage headline; compare
within-method only). **CORPUS: 27.6% native (9,415)**. Play-weighted lenses: **top-1k 66.2% ·
top-2.5k 47.5% · top-5k 36.9%** — the four numbers every session republishes.

**3 · NEWEST LIVE-FIRE BREAKAGE** (fresh 36-game 15-deck batch, v0.128.0): Veil of Summer ×4 ·
**Harmonized Crescendo ×3 (⚠️ RUNTIME-MISMATCH RECURRENCE — the v0.117 Convoke fix claimed this
class native; S1 must root-cause)** · Fraying Sanity ×2 · Plan the Heist ×2 · Seize the
Spotlight ×2 · Freed from the Real · Galvanic Blast · Ordeal of Nylea · Well Rested. 20 entries/36 games.

**4 · TRIGGER-LABEL RESIDUE**: R1.3 (v0.128.0) split condition-not-met from
trigger-removed-no-target at the engine level — the named cards (Kogla, Defense of the Heart,
Scourge of Fleets) get S7 verification during their decks' ledger closes (Scourge's DROP class
was FIXED in R1.2).

**5 · ARBITER-IN-RUNNER STATUS**: the seam exists (default-off `resolveArbiter` hook +
verdict store + prepass, v0.117) but **no verdict SOURCE is wired** — grind-time gated cards
still no-op (logged `spell-unresolved`, null-labeled). "Gated" in grind data = unplayed, not
Ollama-resolved. The verdict source remains the pending piece (Omnath-adjacent).

**6 · ★ THE SLICE MANIFEST** (`app/scripts/slice-manifest.json`, generator committed):
**2,520 ladder-matched non-native cards → projected corpus 27.6% → 34.9%** if the full ladder
lands. By size: transform-dfc 680 · tutors 417 (11 in top-1k — the most-played king) ·
loyalty-activated 313 · counterspells 219 · token-copies 217 · target-mill 136 · suspend 110 ·
cum-upkeep 71 · level-up 62 · venture 50 · batch-combat 44 · self-bounce 41 · cascade 33 ·
incubate 28 · wheels 26 · the small tail (spores/initiative/bite-pw/detain/graft ≤19 each).
INTERACTION CLASS TOTAL ≈ 662 cards — Omnath's call confirmed by data. Unmatched bespoke tail:
22,234 (mechanismBucket groups in the JSON). Method stated in-file (pattern-proxy; flip-diff is
truth at build time). Triage ledgers: `app/scripts/triage-ledgers.json` — 327 rows, all 15 decks.

☀️ **QUESTIONS FOR COLTON**: none yet — Phase 1 building started (S1 first per the order).


> ROTATING doc (rotation rule enforced 2026-07-09: current cycle only; history lives in
> [archive/WAKE-REPORT-through-2026-07-09.md](archive/WAKE-REPORT-through-2026-07-09.md) + git).
> Boot order + method: [MASTER-GUIDE.md](MASTER-GUIDE.md). The queue: `memory/orders/master-plan-2026-07-09.md`.

## ⚡ 2026-07-09 NIGHT — THE R-WAVE SESSION SHIPPED (v0.128.0): R1+R2+mulligan+pool-tag+epoch-2 = the ONE re-anchor

**One session, the master plan's whole critical path — epoch 2 starts here.**

- **R1 engine CREED-FPs (5)**: exile-instead no longer fires dies-triggers (phantom Blood-Artist
  drains gone; log relabeled `creature-exiled-instead`) · `eachOpponentCreature` registered
  (Scourge-class mass bounce was silently DROPPED at the flush while classified native) + the
  drift guard now SCANS EMITTERS (an omission fails by name) · upkeep-win not-met → sentinel
  (breakage-queue pollution gone) · storm combat-referent guard · payLife/discard affordability
  re-check. Tier flip-diff **LOST=0 GAINED=0** (10,157 native).
- **R2 store data-trust (7)**: decisive-only win rates + winner splits · run-caps never persist ·
  crash-window duplicate-index self-heal (write-side skip + read-side dedupe) · pool parent
  unhandled-rejection guard + tmp cleanup · `shuffleLibrary` requires the seeded rng ·
  seed math single-sourced (`seedMath.js`) · `/api/self-play` gamesPer clamp [1,50].
- **MULLIGAN OVERHAUL (SIM-INTEGRITY Phase 2)**: `makeMulliganPolicy(playbook)` — land windows,
  color-aware castable floors, piece demands, ship floors (combo mulls to 4) — replaces the
  poison filter for every persona seat; London bottoming now ranks WORST-N (excess lands →
  uncastable/highest-MV) instead of the blind tail; `mulliganPolicyV: 2` stamped. 27 policy tests.
- **POOL TAG (Phase 3)**: Rograkh/Thrasios + Kinnan = `cedh`; pods form within ONE pool
  (loop/workers/route/SimCenter selector); headers + summarize record it. 13 mixed / 2 cedh.
- **EPOCH-2 INSTRUMENTATION (all 6, ONE schema bump → v3)**: per-seat finishRank +
  eliminatedAtTurn + manaHealth (colorMiss PARKED — needs a legal-set counter) · winCondition
  taxonomy · rows v2 (legal histogram, rank, stackDepth, forced; nearTie PARKED — seam lacks
  chooser scores) · `build-grind-card-evidence.mjs` (cast×outcome, the corpus blend feed) ·
  `replay-canary.mjs` + dedupe guard · Wilson CIs + seat-skew flags + player-turns label +
  per-version/per-pool cuts in the readout.
- **🔴 CANARY FINDING (first run!)**: persona temperament assignment is RANDOM → persona games
  are NOT replay-regenerable; canary discriminates (ENGINE proven deterministic with fixed
  pilots) and gates pruning RED. The per-game seed now rides `buildPilots(seats,{mode,decks,seed})`
  — **Omnath must make temperaments seed-derived**, then the canary greens and pruning unlocks.
- **R7 deletions (Colton-approved, all verified)** + **R4.1** Arbiter CR citations fixed against
  the bundled CR (tax 903.8, shield 122.1c, destroy 701.8, Day/Night 731) with a permanent
  cite-guard test · **R6** CHANGELOG dated, E1 purged, this doc rotated · eslint now covers
  scripts/**/*.mjs (instantly caught a parse-breaking bug in grind-worker).

**ANCHOR LINEAGE (the ONE re-anchor, ×2 each):**
`53614053…` (6,629 rows — FFA sole-survivor era, v0.126.0)
→ `36afd790…` (6,304 rows — playbook mulligans + ranked bottoming changed kept hands)
→ **`3fe82499059d1086da0a67bfe336f22d2af4fe2a96884590bb0d5e5e712f1431`** (6,304 rows — rows-v2
payload growth; identical row count = decisions PROVEN unmoved). Legacy pins: `legacyUserPivot`
reproduces `ab524e20…`; `mulligan:false` byte-identical; playbook-less seats keep the old filter.
Suite **8,072/586** · lint 0/0 · census 1 breakage entry (unchanged).

**DATA ERAS**: epoch-1 archive (`self-play/grind-archive-2026-07-09-epoch1/`, 27.5 GB, winners
fabricated pre-schema-2 — decision-mining only) · **epoch 2 = schemaVersion 3, live store, starts
with the post-v0.128.0 pool relaunch — the clean baseline era.** Standings trust schemaVersion≥2;
mulligan data never pools across `mulliganPolicyV`.

**⚠️ OPEN / NEXT** (full queue in the master plan): Omnath — seed-derived temperaments (canary
gate) + golden mulligan hands (Colton eyeballs) · R4 remainder (Karn banlist, modelProvider
agentName, pilot cache-bust, export inventory, UI error-swallowing set, rulings degrade) · R5
ship-chain (SHA-pin actions, Node bump, placeholder nonce, lib.rs expect, port fallback per
Colton's design) · R6 remainder (README, CLAUDE.md updater doc — Colton: code is right, docs
wrong) · R8 test debt · updater-relaunch forensics (evidence in COMMS 2026-07-09) · HARNESS-DATA
waves 4-6 (reality reports → Stage-A tuning → distill handoff).
