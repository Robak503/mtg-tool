<!-- ═══════════════════════════════════════════════════════════════════════════════════════════ -->
<!-- ⚡ MOST-RECENT — read me first -->

## ⚡ 2026-07-08 LATE — `pilotType` grind tag (v0.121.0) + ⚠️ DECK-DATA CORRUPTION RECOVERED

**COLTON — READ THIS:** Your AppData deck store got **corrupted** (a torn atomic write — the app crashed
mid-save, leaving trailing garbage on `decks.local.json`). The live file had been reduced to 2 junk test
decks. **Fully recovered — all 15 decks are back + playable:**
- **9 Joe decks** recovered from the corrupt backup's valid prefix.
- **Your 6 personal decks** (Vihaan/Koma/Rograkh/Slivers/Zaxara/Omnath) restored from a perfect-fidelity
  pre-migration backup (`data/.pre-profiles-backup/`, 2026-06-05, app format with correct basic-land counts) —
  merged into the active profile. **Verified 15/15 playable (6 colton + 9 joe, 0 rejected).** Rograkh/Thrasios
  handled as 2 commanders + 98. **Tonight's grind pool = all 15 decks.** Nothing lost; every prior state backed up.

**🗄️ NEW SAFE RECOVERY PLACE — `<approot>/deck-vault/`.** So this can't bite you again: a self-contained bundle
OUTSIDE the app's write path (an app crash can't corrupt it) holding **all 15 decks + oracle text for all 942
unique cards + a one-command restore script** (`node restore-decks.mjs`, sandbox-tested) + `RESTORE.md`. **Copy
that folder to cloud/USB for off-machine safety.** (Follow-up for me: harden the app's deck-save to auto-keep
last-N good backups + auto-restore on a torn write — the root fix; noted in the queue.)

**⚠️ Persona wiring:** Omnath's v2 classifier auto-assigns a playbook to each of the 6 restored decks (they're
"wired"), but it MISFIRES on ~4 (Omnath→go-wide should be ramp, Sliver→ramp should be tribal, Vihaan→go-wide,
Koma→go-wide). Not blocking — personas still play legally so the grind data's valid — but flagged to Omnath in
COMMS with the full table to tune (their heuristic, their lane).

**✅ GRIND BUTTON PROVEN END-TO-END** (real machine, exact server path): loaded the 9 recovered decks + Omnath's
deployed `omnath.mjs` persona → `startGrind` → played **3 real commander games, all trusted**, appended to the
data store. Inspected a written record: `engineVersion: 0.121.0` (fix confirmed), a real 31-turn game, all 4
seats piloted on deck-native playbooks (value-control/voltron/go-wide), and **1815/1815 decision rows tagged
with `pilotType`**. Press it tonight — it works. (Those 3 games are valid data left in the store as a head start.)

**Shipped v0.121.0 (`pilotType` tag):** every recorded grind/self-play row now stamps `pilotType`
(`specialist`|`generalist`) next to `{playbook,temperament}` — Omnath's explicit COMMS ask, so their distill
consumer splits expert-baseline vs generalist/stress data with no lookup. Also fixed engine-version
attribution: `package.json` was frozen at 0.116.0 so every record mis-stamped `engineVersion`; now synced from
the release tag at build time (CI + local). **A/B-verified byte-neutral to the hashed trajectory anchor**
(`b005eea…` identical old/new on the synthetic pod; the real `ab524…` anchor is safe by the same null-pilot
mechanism). Lint 0, 75/75 touched-area tests green.

<!-- ═══════════════════════════════════════════════════════════════════════════════════════════ -->

> 🤖 **FULL-AUTO AUTONOMOUS RUN — 2026-07-08 (Cindy, Opus 4.8). Colton: "no need to stop full auto just put things for me in the wake report."**
> Mid-session Colton re-scoped me OFF the blind Joe-frontier grind ONTO **Omnath's sim-center handoff** (COMMS top), order **"2 then 1 then 3"**
> then the rest of the handoff, then back to a **structured Joe-shelf grind**. This block is the live progress log — I do NOT stop to check in.
>
> **ORDERED BACKLOG (executing top-down, full-auto):**
> 1. ✅ **Pilot-seam #1 — CLI half** (`1a13c3e5`): `self-play.mjs --pilot=<path>` injects a persona module into every seat + `scripts/pilots/
>    example-pilot.mjs` reference template. E2E-verified: rows tag {playbook,temperament}, byte-identical when wrapping default (seam clean).
>    Omnath's `omnath-tools/pilots/decide.mjs` plugs in directly. **✅ replay-header** (`1a7322a7`, Omnath contract 2a): export header now carries
>    engineVersion + pilot-map + seed → replay-reconstructable.
> 2. ✅ **Pilot-seam — PANEL half BUILT** (`769a086d`, Colton needed it live for Omnath to work). Packaging call MADE: a WRITABLE
>    `pilotsDir()` = `%APPDATA%/com.colton.mtg-tool/pilots/` (not bundled resources) so Omnath drops/edits persona .mjs files → they appear in the
>    SimCenter dropdown with NO rebuild. `pilotLoader.js` (listPilots + buildPilotsForBatch, path-guarded) · `/api/pilots` GET (list) ·
>    `/api/self-play` reads `body.pilot` → builds the seat→pilot map server-side (closures can't cross JSON) → injects into runSelfPlayBatch ·
>    SimCenter "Pilot" dropdown (fetch + POST). Verified: /api/pilots 200, loader lists+builds a 4-seat map w/ tags, path-traversal blocked, app
>    compiles no-error, lint 0. Personas are SELF-CONTAINED (decide reasons over passed {state,legalActions}; AppData modules can't import app
>    internals). **Follow-up:** the value-JSONL banked-data pilot tag (selfPlayRunner :459/:951) so the panel's "Bank training data" rows carry
>    {playbook,temperament} (persona PLAYS + P5 report reflects it today; the CLI already exports fully-tagged trajectories).
> 3. ✅ **Arbiter-in-runner (#2) — ENGINE-SIDE LANE BUILT** (`ae46f8b2` foundation + `cfac49ef` pre-pass). Spec: **[[ARBITER-IN-RUNNER-SPEC.md]]**.
>    `arbiterVerdictStore.js` (cache/determinism boundary) + `applyArbiterVerdict` (verdict→atoms via resolveAtom, ALL-OR-NOTHING CREED-safe) +
>    default-off `resolveArbiter` hook at `learnSession.js:1016` threaded through the runner + `arbiterPrepass.warmArbiterCache` (pluggable resolver,
>    dedup, static validator). **CARDINAL GUARD HELD: hook OFF ⇒ `ab524e20`/5706 byte-identical.** 16 tests, suite 8017, lint 0. **Remainder (pluggable
>    + iterative, mirrors --pilot):** the VERDICT SOURCE — a tuned structured-Ollama resolver OR a curated verdict set (a small local model can't
>    emit valid atoms; Ollama here is only 7B/32B, not the 14B Arbiter) — plus the CLI `--warm-arbiter=<module>` invocation. That's Arbiter/ruling
>    lane (Omnath-adjacent), not core engine; deferred behind the Joe-shelf grind per Colton's order.
> 4. ⚠️ **Data-grounded grind (#3) — REFRAMED by a scout (2026-07-08).** Omnath's breakage queue is **NOT a coverage-gap queue**: 4 of the top-5
>    are ALREADY classifier-native — Garruk's Uprising (`native-mixed`, both draw triggers route), Harmonized Crescendo (`native-spell`), Freed
>    from the Real (`native-activated`), Inventors' Fair (`land`). Only **Ordeal of Nylea** is genuinely `body-only` (attacks→+1/+1→conditional-
>    sacrifice→search-2-basics chain — a real subsystem flip). So a ubiquitous native staple (Garruk's, in 4 decks) accrues "breakage" hits by
>    PRESENCE-CORRELATION, not by being unresolved — flipping "gated" cards won't move those counts. **Reconcile with Omnath (COMMS Q-BREAKAGE):**
>    what signal does `selfplay-report.cjs` actually count? If it's `spell-unresolved`, a native card shouldn't appear — so either the aggregator
>    keys on card-present-during-any-breakage, or these natives have a real RUNTIME sub-interaction bug the classifier can't see (that's the
>    Arbiter-in-runner #3 lane's concern, not a coverage flip). Until reconciled, grind the CLASSIFIER-gated cards (Ordeal of Nylea +
>    joe-targets/census gated lists), not the raw breakage names.
> 5. 🔜 **Rest of handoff:** slang glossary (low-pri, `omnath-tools/reference/mtg-slang/` → cardIndex nickname lookup) · trajectory sidecar 2b
>    (snapshot decideDebug on discovery-wins / playbook-flip forks — the only piece of Omnath's contract 2 still open).
> 6. 🏁 **Joe-shelf grind (Colton's method) — LAUNCHED on WOLVERINE** (Omnath data: worst win 1.2%, engine-tanked → flipping its ~handful of
>    blockers reveals real strength). **36/42 gated.** Method: fan out READ-ONLY analysis agents per cluster (read-only avoids the shared-worktree
>    build hazard — [[project_parallel_shared_worktree_hazard]]) → they return specs → Cindy BUILDS the thin flips + adversarially verifies each
>    (builders over-promise — [[feedback_ultracode_builder_overpromise]]) + flip-diff LOST=0 + trajectory hold before commit. **Clusters found:**
>    (a) FIGHT / "deals damage equal to power" (Ram Through, Beastie Beatdown, Last Agni Kai, Meltstrider, Ancient Animus, Nibelheim, Berserk);
>    (b) EQUIPMENT (Lizard Blades/Reconfigure, Brotherhood Regalia, Cori-Steel Cutter/Flurry, Conformer Shuriken — warm infra from 0873c4d4);
>    (c) +1/+1 COUNTERS. **3 analysis agents DONE — results (adversarial catch: agents found my prompt oracle for High Score/Quilled was INCOMPLETE;
>    the real riders are the gate — verify oracle before building):**
>    · **THIN (build next): Lizard Blades** — Reconfigure keyword unrecognized → 2 edits: `abilities.js:393` add a reconfigure branch (mirror equip,
>    `isEquipAbility:true`) + `coverage.js:923` widen `modeledEquipLine` to accept `reconfigure {cost}`. Enforcement REAL (attach dispatches on
>    isEquipAbility). Flips native-equipment. RUNTIME-VERIFY the attach+bonus applies before crediting.
>    · **REUSE (medium, one real add each):** High Score (doubler already native; needs superlative "greatest power" interveningIf @ interveningIf.js:108) ·
>    Sylvan Scavenging (modal per-mode `if`-conditional plumbing; condition already modeled) · Canopy Gargantuan (new `perTargetToughness` add-counter,
>    extends counterClauses per-target scaffold) · Ancient Animus + Ram Through (fight atoms exist — combat.js fight-pair/damage-target-power — + ONE
>    bounded rider each: conditional-legendary-counter / trample-excess). ALL are FP-if-flipped-bare (drop a rider) → must enforce the rider too.
>    · **SUBSYSTEM (defer):** Conformer Shuriken (reflexive conditional) · Brotherhood Regalia (3 grant primitives: ward-N/add-type/unblockable) ·
>    Cori-Steel Cutter (flurry label THIN + token-with-keyword subsystem) · The Ozolith + Forgotten Ancient (counter-TRANSFER/move subsystem) ·
>    Warden (endure keyword) · Well Rested (becomes-untapped event + once-per-turn) · Level Up (double-on-it + conditional-draw) · Nibelheim/Beastie/
>    Last Agni Kai (fight riders: fanout-scope/declare-ref/mana) · **Berserk = KEEP ARBITER** (drops mandatory self-destruct = dangerous board FP).
>    Next: build Lizard Blades (verify), then High Score/Sylvan/Canopy/Ancient Animus/Ram Through as bounded reuse-+-rider slices, then Kellan (3.6% win).
>
> 7. 🔬 **Omnath COMMS #4 (classifier↔runtime MISMATCH) — CONVOKE HALF FIXED** (`2951c303`). Root cause: the classifier strips cost-only keywords
>    (Convoke/Affinity) before parsing a spell's effect → HIGH → native, but actionDispatcher parsed the FULL oracle → the bare "Convoke" line → LOW →
>    pendingArbiter. So **Harmonized Crescendo (257×) + the whole Convoke/Affinity spell class** were classifier-native but Arbiter-routed at runtime.
>    Fixed: actionDispatcher now strips cost-only keyword lines before parseEffectProgram (same helper as the classifier); body was GENUINELY modeled
>    (not an over-claim — draw amountCount:chosenTypePermanents). Hash HELD (clean, no re-baseline), suite 8025, 3 tests. **REMAINDER:** Freed from
>    the Real (native-activated Aura "{U}: Tap/Untap enchanted creature", 174×) is a DIFFERENT mechanism — aura activated abilities on the host route
>    to Arbiter; separate investigation, next. **✅ #3 Garruk's mislabel FIXED** (`fbd22c9f`). **Ordeal of Nylea** = the one clean spell-unresolved coverage flip.
>    Also this stretch: pilot seam COMPLETE (CLI+panel+replay-header+value-JSONL tag `6584eac3`), Arbiter-in-runner engine lane, v0.117.0 live.
>
> **RELEASE:** ✅ **v0.117.0 SHIPPED** — master FF'd `caf454b1..1a7322a7`, tag pushed → CI building (run 28991474833). **+55 native since v0.116.0**
> (foretell/blitz +25 · has-have +7 · play-from-top +3 · monstrosity +5 · Gishath +1 · equipment +12 · misc +2), LOST=0. Suite 8006 green. Full entry ↓.
> **Q2 (carryover, non-blocking):** energy-gated mana dorks stay parked (safe FN; my lean = keep parked unless you want the ~10-15-card build).
>
> ── ↓ shipped releases ↓ ──
> 🛠️ **v0.117.0 — 2026-07-08 (Cindy, Opus 4.8). SHIPPED — +55 native, LOST=0. Coverage grind + the FIRST sim-center engine seam.**
> Two threads. **COVERAGE (+55, all flip-diff LOST=0, trajectory `ab524e20` held byte-identical, suite 8006):** ① **foretell / blitz /
> freerunning / prototype** alt-cast recognition (`7b10e44d`, +25 — the morph-era recognition-lever vein) · ② **singular "has" counter-payoff
> keyword grant** (`378cbad9`, +7) · ③ **play-from-top-of-library subsystem** (`b752875b`, +3, ENFORCED — Future Sight [Kellan]/Magus/Goblin Spy;
> staticAbilityParser marker → legalChoices lane → dispatcher, AI actually casts the top card) · ④ **Monstrosity keyword action** (`05e5dc2f`, +5,
> once-only +1/+1 latch, CR 701.32) · ⑤ **Gishath reveal-that-many put-filtered** combat-damage trigger (`bca4910f`, +1 Joe — a genesis-wave
> sibling, count = combatDamageAmount) · ⑥ **equipment cluster** (`0873c4d4`, +12 — ETB legendary auto-attach [Mithril Coat=Joe, via a new
> supertype target restriction] + a self-keyword-equipment coverage FN fix → Darksteel Axe/Plate, Captain America's Shield, Vibranium daggers,
> Stoneforged Blade…; equip bonus runtime-verified applied via CR-613 layers, NOT a recognized-but-unenforced FP) · ⑦ misc +2. Also **locked**
> (`3febf406`, test-only): a discover/cascade FREE-cast fires the caster's cast triggers (CR 702.166b — was already correct; now guarded).
> **SIM-CENTER (Omnath handoff #1):** `self-play.mjs --pilot=<path>` (`1a13c3e5`) injects a persona module into every seat + `scripts/pilots/
> example-pilot.mjs` reference template — self-play is no longer persona-blind; rows tag {playbook,temperament}; determinism preserved (a
> default-wrapping pilot plays byte-identical). **Replay-header** (`1a7322a7`, Omnath contract 2a): omnath-trajectory-v1 export now self-describes
> engineVersion + pilot-map + seed → any decision replay-reconstructable with decideDebug (zero per-row reasoning stored). **NEXT (full-auto, see
> top block):** Arbiter-in-runner (#2) → data-grounded grind (Garruk's Uprising ×307) → handoff rest → structured Joe-shelf grind (deck-by-deck agent fan-out).
> 🃏 **v0.116.0 — 2026-07-08 (Cindy, Opus 4.8, autonomous grind). SHIPPED — +111 native, LOST=0. MORPH + a whole vein of RECOGNITION levers.**
> Cut at 111 — a big one, but honest: dominated by **alt-cast / face-down keyword recognition** (morph +65, dash +16, disguise +11, sneak +8),
> a single sanctioned lever class (the cycling/ninjutsu precedent — the card hard-casts normally; the optional alt entry is inert), NOT bespoke
> builds. **Correction to the last run's Q4 claim** ("clean parser/targeting levers are exhausted"): dead wrong — **RECOGNITION levers**
> (keyword-cost / alt-cast forms already enforced-or-inert but unrecognized by the classifier) were the richest untapped vein of the whole
> project. Also this release: the **dealt-damage controller-scope trigger** (Rite of Passage, +1, a reusable non-self enrage sibling) and a
> **latent CREED FP fix** — a pure "when turned face up, until end of turn, whenever X" delayed trigger (Mistway Spy) was mis-read as a
> PERMANENT trigger; classifyCondition now leaves it undetected (unreachable on a hard cast). **The core bundle (morph-era):**
> **① MORPH / MEGAMORPH** (`42e2cf73`, +65) — `isKeywordOnly` gains `reMorphCost` (brace-cost anchored, mirrors reCyclingCost/reNinjutsuCost).
> Morph is an optional alt-cast with no engine lane; every morph card ALSO hard-casts face-up correctly, so recognizing it is honest (the
> ninjutsu rationale). **Adversarially verified — 3 skeptics, live engine: 0 anomalies across all 65 (each offers exactly ONE face-up cast,
> identical to a body-only morph card; no morph/alt-cast lane fires), Ponyback ETB fires 3 goblins, megamorph ignores the face-down counter,
> LOST=0 independently reproduced, Disguise/Cloak/non-mana-morph/statics all correctly stay body-only.** 3/3 refuted=false.
> **② DOUBLE power/toughness** (`d432477d`, +3) — Unnatural Growth (team), Reckless Amplimancer (self), Tifa Lockhart (self power-only, via a
> possessive self-name rewrite). A NEW per-target pump mode: each creature gains +its-own-current-P/T (CR 701.10 snapshot). **Adversarial gate
> CAUGHT a real CR 701.10c bug** (a `Math.max(0,…)` floor under-doubled negative power) → FIXED (signed delta) + pinned.
> **③ Ward—Pay N life** (`28b7c7e8`, +3) — Owlin Shieldmage / Sire of Seven Deaths / Dwarven Forge-Chanter. The life-tax is ALREADY enforced
> end-to-end (proven: soft-counter fires cost-aware); only the em-dash classifier recognition was missing. Ward—Discard/Sacrifice stay
> body-only (unenforced victim-choice, safe FN). **④ Pre-session pot** (`890716fc`+`ff81e231`, +4) — Reanimate-drain + non-creature artifact clones.
> **Fence (every batch): flip-diff GAINED=intended/LOST=0 · lint 0 · trajectory `ab524e20` ×N (metric-only changes, zero runtime drift) ·
> full suite 565 files / 7,955 green · doublePt/wardPayLifeCost/morphKeyword tests.** **NEXT clean vein: more recognition levers** — exalted
> (~16, needs the attack-alone pump enforced), flanking (~7), soulshift (~15, dies-trigger); then bespoke subsystems (graft/suspend/detain).
> 🔒 **v0.115.0 — 2026-07-08 (Cindy, Opus 4.8, 7-HR RUN). SHIPPED — +21 native, LOST=0. THE STUN MECHANIC + energy completion.**
> Cut at 21 (a whole new mechanic + energy finished) after the clean-lever space was genuinely exhausted. **The bundle:**
> **① STUN mechanic** (`f0f28691`, +11) — "tap target creature and put a stun counter on it" is now an ENFORCED tap-lock (CR 122.1c):
> untapAll skips a stunned creature's untap + removes one stun counter; splitClauses keeps the tap+stun compound whole; tapClauseParser
> folds stunCounter onto the tap atom. **Adversarially verified — 3 skeptics, live engine; the gate CAUGHT a real completeness bug**
> (the lock lived only in untapAll, so untapPermanent / Seedborn Muse / Murkfiend bypassed it) → **FIXED** (`later commit`) with a single
> untapOrConsumeStun helper every untap path uses. Re-verified: the lock holds on ALL untap events.
> **② Energy Slice C** (`88cc6363`-era, +5) — optional-pay triggers "you may pay {E}{E}. If you do, <effect>" (Aether Poisoner/Servo
> family), the energy variant of the optional-mana-payment atom (pays-if-able, spends energy, runs the payoff only on a real pay). The
> ENERGY MECHANIC IS NOW COMPLETE (gain v0.113→114 · pay v0.114 · optional-pay v0.115).
> **③ Exile-from-opponent-graveyard** (+5) — Disposal Mummy family; the atom already handled it at resolution, only the parser form +
> the ENEMY trigger intent were missing. Verified end-to-end it exiles the OPPONENT's card, never own.
> **Fence (every batch): flip-diff GAINED=intended/LOST=0 · lint 0 · trajectory `ab524e20` ×2 · full suite 561 files / 7,933 green ·
> energyOptionalPay/stunSubsystem/gyExileOpponent tests.** **Session total (this 7-hr run): 5 releases, ~146 native flips** (v0.111 +33 ·
> v0.112 +32 · v0.113 +32 · v0.114 +28 · v0.115 +21), the ENERGY mechanic, the STUN mechanic, 5 engine bug-fixes, a housekeeping audit,
> and a mana-model correctness fix — all adversarially verified where it counts.
>
> 🔋 **v0.114.0 — 2026-07-08 (Cindy, Opus 4.8, 7-HR AUTONOMOUS RUN). SHIPPED — +28 native, LOST=0. THE ENERGY MECHANIC + two-target tricks.**
> Cut at 28 (a hair under the 30 bar) because it lands a whole MAJOR subsystem — deliberate, not a slip. **The bundle:**
> **① ENERGY subsystem** (`882fc139`+`88cc6363`, +22) — {E} is now a player resource (`player.energy`). **Slice A (gain):** "you get {E}…"
> → add-energy atom (mirrors gain-experience) + the mana model made ENERGY-AWARE (an energy-gated "{T}, Pay {E}: Add …" line is NOT free
> mana → Servant of the Conduit non-native; Aether Hub credited its real free {C}, fixing a pre-existing any-color OVER-count). **Slice B
> (pay):** "Pay {E}…" is an ENFORCED activation cost (mirrors payLife across abilities.js parse → legalChoices gate → actionDispatcher
> spendEnergy; single deduction site). **Adversarially verified — a 4-skeptic workflow ran the LIVE pipeline: cost-bypass CLEAN (no path
> activates without paying), all 23 flipped cards execute correctly, AI never activates unaffordable or fires damage at itself. 4/4 SHIP.**
> **② Two-target pump/debuff** (`e8f1ccd8`, +6) — pump-pair atom; the adversarial gate CAUGHT a real enemy-buff half-resolve FP (a legacy
> single-target route) → fixed with a parseSpellEffect guard so it routes through the role-tagged two-target path. Re-verified.
> **③ Engine fixes:** CR 111.7 token-cleanup (`811f5a7a`, bounced/exiled tokens cease to exist — a pre-existing engine-wide gap Colton
> handed me) + the pump-untap departed-target crash (v0.113.0 carryover fix) + the Aether Hub mana over-count.
> **Fence: flip-diff GAINED=intended/LOST=0 each batch · lint 0 · trajectory `ab524e20` ×2 (no energy cards in the pod; non-energy abilities
> byte-identical) · full suite 7,913 green · energyGain/energyPay/twoTargetPump/fightPumpFight/selfBounceOwn tests.**
> **NEXT:** energy Slice C — optional-pay triggers "you may pay {E}. If you do, <effect>" (~37 cards; needs an optional-pendingChoice-with-
> energy-cost mechanism — flagged Q1). Then the remaining tail is bespoke subsystems (suspend/graft/stun/detain/token-copies).
> 🚀 **v0.113.0 — 2026-07-08 (Cindy, Opus 4.8, OVERNIGHT GRIND part 3 + housekeeping). SHIPPED — +32 native, LOST=0.**
> You said **"keep adding cards"** — so I pushed PAST the earlier "safe-parser ceiling" into the systems bucket and broke through it with
> the biggest lever, adversarially verified. **The 32 (3 commits):**
> **① "another target creature you control gains KW"** (`9b3398ee`, +9) — Flesh Burrower / Starling / Trained Condor / Heavenly Qilin /
> Toxic Scorpion / Void Grafter / Selfless Savior / Blooming Stinger / Scourge (the "another"/excludeSource prefix on the already-native
> grant; source runtime-excluded).
> **② SELF-BOUNCE-YOUR-OWN** (`d72985a4`, +19) — "return a[nother] permanent|creature you control to its owner's hand" (Kor Skyfisher,
> Emancipation Angel, Cache Raiders, Roaring Primadox, Shrieking Drake, Invasive Species, Yarok's Wavecrasher, Time Wipe, + the "you may"
> optionals Ambrosia/Aviary/Loyal Gryff). The systems lever I'd earlier parked as "needs an AI choice heuristic": built it (scope
> `oneYouControlWorst` → the least-bad own permanent, a land you replay first; "another"→excludeSource; "you may"→optional pause) and had
> a **4-skeptic adversarial workflow run the LIVE engine** across over-match / optional-decision / heuristic+Time-Wipe-sequencing /
> excludeSource-on-flush — **all 4 voted SHIP, no false-positive constructible.** Reframed the risk correctly: the engine's job is
> CORRECTNESS (returns a valid own permanent, exactly as printed), not strategic optimality (the policy learns that).
> **③ "up to one [other] target permanent|creature you control"** (`d1037825`, +4) — Stickytongue Sentinel / Exosuit Savior /
> Mischievous Pup / Flock Impostor; same worst-pick scope, "up to one"→optional (may bounce zero). Reused the just-cleared machinery.
> **Also this session (non-coverage):** a **HIGH crash fix** (`0d906868`) — pump-untap / untap-then-pump tricks no longer throw when the
> target left the battlefield (missing findPermanent guard; CR 608.2b fizzle) — found by a **5-dimension housekeeping audit** (19 agents)
> that also removed a stray root debug probe (`cntprobe.mjs`, shipped by accident in v0.112.0), added a `.gitignore` root-scratch guard,
> and dropped a stale test-count anchor from CLAUDE.md (`30a49afe`). **Fence (every batch): flip-diff GAINED=intended/LOST=0 · lint 0 ·
> trajectory `ab524e20` ×2 · full suite 554 files / 7,898 tests green.**
>
> **📌 FLAGGED FOR YOU (not touched — release/secrets/hazard):** (a) **Rust version drift** — Cargo.toml 0.99.0 / Cargo.lock 0.88.0 vs
> app 0.113.0 (cosmetic — the release embeds tauri.conf.json's version; recommend a CI "sync Cargo.toml to tag" step). (b)
> `scripts/finish-p0.ps1` — a consumed one-shot with a hardcoded path that uploads signing keys; left as reference (remove or make
> `$PSScriptRoot`-relative — your call). (c) **~13 orphaned worktree dirs** under `.claude/worktrees/` (~92MB, mostly one) — the
> junction-`node_modules` deletion HAZARD means verify-each-then-delete, so I left them. (d) **token-cleanup SBA** — a bounced/exiled
> TOKEN wrongly persists in hand (CR 111.7); PRE-EXISTING + engine-wide (affects Man-o'-War too, not the new levers) — filed as a
> spawned task. **Session flip total: 97** (v0.111.0 +33 · v0.112.0 +32 · v0.113.0 +32). Still grinding; the remaining tail is genuine
> subsystems (suspend/graft/stun/detain/energy) that each need a real engine build.
>
> ── ↓ shipped releases ↓ ──
> 🌅 **v0.112.0 — 2026-07-08 (Cindy, Opus 4.8, OVERNIGHT GRIND part 2). SHIPPED — +32 native, LOST=0. Four clean parser levers.**
> Second overnight release (grind continued past v0.111.0 per "keep working until you can't, even after releases"). **The 32
> (3 commits, each full-battery'd):**
> **① Pump-then-fight spells** (`f14399b2`, +7) — "Target creature you control gets +X/+Y until end of turn. It fights target
> creature you don't control" (Epic Confrontation / Savage Smash / Swift Kick / Wild Instincts / Ruthless Predation / Chelonian
> Tackle + Mage Duel). This was a DELIBERATELY-PARKED case (the `fightAtomMisplaced` guard — a source-less spell `fight` no-ops):
> superseded by collapsing UP FRONT into ONE fight-pair atom carrying `fighterPump {X,Y}`; applyFightPair buffs the chosen fighter
> before locking powers. RUNTIME-PROVEN (fightPumpFight.test.js): a 2/2 +1/+2 now WINS vs a 3/3 where the unpumped control loses.
> **② Untap-then-pump spells** (`7b6f433a`, +6) — "Untap target creature. It gets +X/+Y [and gains reach]…" (Ornamental Courage /
> Inspirit / Gerrard's Command / Spidery Grasp / Aim High / Steady Aim) → one pump atom with untap:true (order-independent; reuses
> the shipped Vines-of-the-Recluse machinery).
> **③ Target-opponent discard + ④ cant-block "an opponent controls"** (`e2660324`, +19) — the two families' target-side phrasings
> that were missing on already-runtime-supported atoms (the "target player"/"target creature" siblings were native). Enemy intent
> already correct; targeting tags opponents as {type:"player"}. RUNTIME-PROVEN the chosen opponent (only) discards.
> **Fence (every batch): flip-diff GAINED=intended/LOST=0 · lint 0 · trajectory `ab524e20` ×2 (none of the 32 in the Tier-1 pod) ·
> full suite green (552 files / 7,885 tests).** Also fixed **5 now-stale merge-gate assertions** across the night (behaviors modeled +
> runtime-verified in a prior/this batch: the optional-own-counter, pump-then-fight, cant-block-opponent, EP-2 discard list, MUST_DROP
> opponent-discard) — one of these (the counter gate) had shipped stale in v0.111.0; the ENGINE was always correct, only test asserts
> were outdated. New colocated tests: fightPumpFight / untapThenPump / discardOpponentCantBlock (parser + classify + CREED + e2e each).
>
> **📋 HONEST-CEILING READ + BACKLOG (the "save why" you asked for):** I ran an exhaustive corpus-wide near-miss analysis (all 34,722
> non-land cards, trigger + spell paths). The remaining ~25k non-native corpus is dominated by **bespoke SUBSYSTEMS** (transform ~70,
> cumulative upkeep ~49, time-counters/suspend ~46, energy ~41, cascade, venture/dungeon, initiative, attractions, spores, incubate),
> **multi-clause cards** where one clause needs a new subsystem, and **static-conditional / second-activated-ability** cards. These are
> the "systems work" you said we'd do later — each remaining flip now needs a real engine build, not a safe parser matcher. The clean,
> low-risk, no-new-subsystem parser levers this session's 65 flips (v0.111.0's 33 + v0.112.0's 32) essentially exhausted. **Ready-to-build
> backlog for a SYSTEMS session (NOT rushed overnight — each has FP surface):** (a) **two-target pump/debuff** "Target creature gets
> +X/+Y. Another target creature gets -X/-Y" (Leeching Bite / Consume Strength / Schismotivate, ~5) — needs a new `pump-pair` atom +
> the opponentAI two-target chooser to assign buff→own / debuff→enemy (wrong = catastrophic mis-play FP, so I parked it, didn't rush);
> (b) **self-bounce-your-own** "return a permanent/creature you control to its owner's hand" (Kor Skyfisher / Roaring Primadox /
> Shrieking Drake, ~11) — needs an own-permanent CHOICE mechanism (edict-like); (c) **target-player mill** (Homarid Explorer, ~3) —
> deliberately deferred (a targeted mill on a trigger could first-legal the CONTROLLER = self-mill FP); (d) **bite-to-planeswalker**
> "deals damage equal to its power to target creature or planeswalker" (Bite Down / Master's Rebuke, ~3) — needs planeswalker as a
> damage target. **Next autonomous step:** I'll keep probing for any remaining SAFE parser lever; if none, the corpus tail is systems
> work (parked, documented above) and I'll hold — nothing left I can flip WITHOUT risking a false-positive, which the CREED forbids.
>
> **⚠️ BLOCKER FOR COLTON (unchanged from v0.111.0, work-around in place):** the adversarial skeptic workflow's isolated worktree
> checks out master, not my session branch → invalid rejections. Work-around: I push first + treat my own gate (flip-diff + runtime +
> battery + trajectory ×2) as authoritative. Low priority (the self-gate caught everything). Master ff-push works without a human gate.
>
> ── prior release (below) ──
> 🌙 **v0.111.0 — 2026-07-07 (Cindy, Opus 4.8, OVERNIGHT GRIND). SHIPPED — +33 native, LOST=0. Six clean levers off Joe's shelf.**
> Colton's standing order: "keep working non-stop, full autonomy, follow your own recs, even 1-card wins that shouldn't be Arbiter;
> park what genuinely can't be gated; cut releases every ~30+ flips; KEEP WORKING even after releases; then pivot to corpus at large
> when Joe's shelf is honestly dry, documenting why here." This is the first overnight release. **The 33 (6 commits, each flip-diff'd):**
> **① Pip-Boy modal equipment attack triggers** (`3352c91a`, +6) — the "choose one" attack trigger on equipment resolves native.
> **② Top-card router** (`6b3fefae`+`257a33ce`, +7) — Zoologist/Coiling Oracle reveal-top-and-route; no-else/draw/OR/scry-compose shapes.
> **③ Reveal-top-drain-by-MV, YOU-lose variant** (`3c34bb7d`, +4) — Dark Confidant: reveal→hand, *controller* loses life = its MV (the
> controller-drain sibling of Yuriko's each-opponent drain; residue-strip mirrored so the whole-card gate clears; runtime traced).
> **④ Clone cost-keyword pre-strip** (`f0921df2`, +2) — copy-clause creatures carrying Plot/Convoke/Affinity (Visage Bandit) read as clones.
> **⑤ Optional own-side +1/+1 counter** (`f0921df2`, +3) — "on up to one target creature you control" (Essence Capture).
> **⑥ Spells-cast intervening-if + creature-bounce controller restriction** (`e1f73f81`, +11) — "if you've cast N spells this turn" (Loan
> Shark) reads the per-turn counter; "return target creature you control / an opponent controls" (Chulane) mirrors the noncreature branch.
> **Fence (every batch): flip-diff GAINED=intended/LOST=0 · lint 0 · trajectory `ab524e20` ×2 (structural — none of the 33 in the Tier-1
> pod) · full suite green (exit 0) · 3 new colocated test files with CREED near-miss guards.** Each commit was pushed as it cleared.
>
> **⚠️ BLOCKER FOR COLTON (work-around in place, no action strictly needed):** my adversarial skeptic workflow spawns an *isolated
> worktree* that checks out **master**, not my session branch — so it diffed an empty `lib/learn` and produced an INVALID rejection of the
> Dark Confidant slice. Work-around: I push the branch first and treat my OWN gate (flip-diff + runtime trace + battery + trajectory ×2)
> as authoritative; the skeptic is advisory only until its worktree is fixed to check out the pushed SHA. If you want skeptic votes to be
> trustworthy again, that worktree-checkout needs a fix (low priority — the self-gate has caught everything). Master ff-push worked without
> a human-review gate this session (same path the parallel Cindy used), so releases are flowing.
>
> **NEXT (grinding continues after this release, Joe-priority queue):** Zacama wasCast intervening-if flag · The Reaver Cleaver
> combat-or-planeswalker trigger · Snakeskin Veil · Rite of Passage (Wolverine) · Street Wraith (Cycling—Pay N life) · Michelangelo
> (Mutagen + counter-replacement, 2 blockers — likely PARK). Honest-ceiling read holds: Joe's tails are mostly bespoke; I'll take the
> careful mediums, park the un-gateable, and roll to corpus-at-large once the shelf is honestly dry (will document the why here).
>
> ── prior release (below) ──
> 🚀 **v0.110.0 — 2026-07-07 (Cindy, Opus 4.8). SHIPPED — all 3 parked judgment calls CLEARED (+5 native, LOST=0).**
> Colton's call: "do the rec that's best+cleanest for the engine on all 3." Bundle (3 commits + chore):
> **① CR-citation integrity** (`a3e8318d`, comment-only) — the stale "CR 720" cites fixed to REAL traceable
> rules verified against cr_current.json: control-change → **613.1b** (layer 2), cant-act static → **604.2**.
> **② becomes-monarch trigger event** (`5ca0c555`, +2) — becomeMonarch (the ONE crown chokepoint) fires a
> `becomesMonarch` event on BOTH crown paths (ETB atom + combat-steal). Flips **Custodi Lich** +
> **Gatekeeper of Malakir** via the edict intent fix: "target player sacrifices" is enemy-intent now (the old
> ambiguous carve-out predated the enemy-aware flush chooser; skeptic proved ALL 8 flush callers pass it — a
> self-edict is structurally impossible; NO_SAFE_TARGET → Arbiter no-op when no opponent target exists).
> **③ Regal Behemoth mana rider** (`df4fc2ff`, +3) — the monarch-gated any-color tap-augment reuses the
> shipped GLOBAL-TAP-AUGMENT infra (parser condition + any-color; runtime monarch gate — skeptic:
> PHANTOM-MANA CLEAN, zero production off-crown, existing augments byte-identical) + the coverage tier now
> COMPOSES an augment with a native remainder → honest bonus flips **Badgermole Cub** (earthbend ETB) +
> **Leyline of Abundance** (activated pump; remainders individually verified native, recursion bounded).
> **Fence: suite 7,838 (+11) · lint 0 · trajectory `ab524e20` ×2 (structural — none of the 5 in the pod) ·
> independent skeptic corpus diff EXACTLY +5 / LOST=0 · OVERALL SHIP.**
> **NEXT (grinding continues, Joe-priority):** Pip-Boy modal attack trigger [Wolverine] (label-strip + "that
> creature" referent + untap-up-to-N-target-lands — the engine has modal-trigger machinery; medium) · Marcus
> Mutant Mayor if/else conditional [Mothman] (medium) · k-descending subset enumeration (64-cap) · bestow
> type-line projection. Wolverine 52.9% / Mothman 57.4% re-censused — no clean multi-card lever left; the
> tails are bespoke (the honest-ceiling read holds; progress = careful mediums from here).
>
> ── prior release (below) ──
> ☀️ **MORNING REPORT — v0.109.0 SHIPPED (Cindy, overnight grind 2026-07-06→07). Bundle: +13 native, LOST=0.**
> **The night's releases: v0.108.0** (Sword of War and Peace, +1) **· v0.109.0** (BUNDLED per your
> do-more-between-releases order: legendary short-name slice +8 · THE MONARCH subsystem +5).
> **Monarch (CR 725):** state.monarchId · become-monarch atom · end-step draw hook · combat-damage crown-steal
> — skeptic ran it e2e in a 4P pod incl. Feast of Succession's full cast. **Short-name slice:** the first
> skeptic REFUTED 5/8 (evasion classified-but-unenforced; Prowler's counter landed on himself) → three fixes:
> combatEvasion.selfOracle normalization · trigger-flush sourceId threading (**a corpus-wide pre-existing FP —
> every "another target" trigger could self-target; Roalesk/Sterling/Loxodon proven fixed vs master**) · the
> Xantcha "can't attack" rider guard. Re-verify: 5/5 CONFIRMED, 2,715 comma-legends exhaustively swept (19
> enforcement corrections, zero false matches), OVERALL SHIP.
> **Fence: suite 7,820 · lint 0 · trajectory `ab524e20` ×2 (independently reproduced by two skeptics) ·
> flip-diff exactly +13/LOST=0.**
> **⚠️ FOR COLTON (judgment calls parked, none urgent):**
> ① Pre-existing possibly-stale citations: gain-control + cant-act comments cite "CR 720" (= Omen cards in the
> current CR) — comment-only sweep wanted, but each needs its REAL rule verified (I fixed only monarch's).
> ② Monarch backlog (skeptic-flagged, safe-FN today): "whenever you become the monarch" watchers (Custodi
> Lich, Knights of the Black Rose) need a becomes-monarch trigger event; CR 725.4 leaves-game succession
> unmodeled (orphaned crown no-ops safely).
> ③ Regal Behemoth [Pantlaza] still parked on its tap-mana rider ("while you're the monarch, tap a land →
> extra mana") — wants the mana-model hook; monarch itself is now free.
> **NEXT MENU (Joe-priority, in order):** Marcus Mutant Mayor conditional counter-draw [Mothman] · Pip-Boy
> modal attack trigger [Wolverine] · Regal Behemoth mana rider [Pantlaza] · k-descending subset enumeration ·
> bestow type-line projection. **OVERNIGHT TOTALS: v0.103→v0.109 = +44 native, LOST=0 throughout, 6 latent FP
> generators closed** (reminder-anchor · vacuous batch filters · restriction-dropping attacks matcher ·
> empty-first subsets · vacuous non-word tax filters · trigger self-targeting).
>
> ── prior release (below) ──
> 🚀 **v0.108.0 — 2026-07-07 (Cindy, Fable 5, OVERNIGHT GRIND). SHIPPED — Sword of War and Peace (+1 native, LOST=0).**
> The damaged-player anaphoric damage target ("that player" + "their hand"), four seams each mirroring a shipped
> twin (defendingPlayer / Cavern-Hoard). Skeptic-CONFIRMED: per-pair hand counts on multi-defender combats,
> equipment-as-source threading, 13 sibling clauses correctly gated off. Sword FN pins re-specimened → Buster
> Sword. Fence: suite 7,806 · lint 0 · `ab524e20` ×2 · flip-diff +1/LOST=0.
> **OVERNIGHT ORDERS (Colton, 2026-07-06 bedtime):** heads-down, Joe-shelf priority, 1-2-card slices fine,
> judgment calls → THIS morning report. **Queue:** ① Toski short-name must-attack (BOTH halves — coverage
> isKeywordOnly + opponentAI selfMustAttack use the FULL name, so "Toski attacks…" misses; fix = pre-comma
> short-name normalization in both) ② monarch subsystem (Pantlaza's Regal Behemoth — zero machinery today:
> state.monarchId + become-monarch atom + end-step draw + combat-damage crown-steal) ③ Pip-Boy modal attack
> trigger ④ Marcus, Mutant Mayor conditional counter-draw.
>
> ── prior release (below) ──
> 🚀 **v0.107.0 — 2026-07-06 (Cindy, Fable 5). SHIPPED — static cost-tax, the Thalia hatebears (+10 native, LOST=0).**
> Slice `72655a8f` + chore; tag **`v0.107.0`** → CI (verdict → CONTINUITY). The INCREASE twin of the shipped
> cost reducers: recognizer (bare / negated-cardtype / cardtype / subtype; colors + supertypes + "for each" +
> targeting-scoped deliberately dropped) · `collectCostTaxers` reads EVERY battlefield (Thalia taxes her own
> controller) · applied at BOTH legalChoices pricing sites, increases-before-decreases (CR 601.2f), MV untouched.
> **Flips (10/10 skeptic-CONFIRMED w/ independent parent-tree corpus diff + live pricing probes incl. the AI seat,
> X-spells, commander-tax composition, free-cast exemption):** Thalia · Thorn · Sphere · Vryn Wingmare · Glowrider ·
> Lodestone Golem · Feroz's Ban · Squeeze · Grand Arbiter Augustin IV (his 2 color reducers probed live too) ·
> God-Pharaoh's Statue (native-mixed; end-step drain probed in a 4P game). Build-time FP caught + guard-pinned:
> "Nonartifact" nearly minted a vacuous subtype filter (the Lodestone class).
> **⚠️ KNOWN SEAM (skeptic-found, low severity, PRE-EXISTING class):** the BESTOW pricing site matches taxes AND
> the shipped reducers against the printed type line, but a bestowed cast is an Aura enchantment spell
> (CR 702.103c) — Thalia under-taxes a bestowed Boon Satyr; a creature-tax would over-tax one. Symmetric across
> seats (self-play internally consistent); fix = a projected bestow type line at the pricing site (menu item).
> **Fence: suite 7,803 (+7) · lint 0 · trajectory `ab524e20` ×2.**
> **SESSION TOTAL (2026-07-05→06): +30 native across v0.103–v0.107, LOST=0 throughout · 5 latent FP generators
> closed** (reminder-anchor drop · vacuous batch filters · restriction-dropping attacks matcher · empty-first
> subset pick · vacuous non-word tax filters). **Menu:** War-and-Peace hand-count metric · Toski statics ·
> monarch · k-descending subset enumeration (64-cap) · bestow type-line projection.
>
> ── prior release (below) ──
> 🚀 **v0.106.0 — 2026-07-05 (Cindy, Fable 5). SHIPPED — subset auto-pick generalized (+5 native · ~14 natives made HONEST).**
> Slice `2be79bc6` + chore; tag **`v0.106.0`** → CI (verdict → CONTINUITY). **The parked slice-5 mystery is
> SOLVED — one root cause:** targetSubsets emits the EMPTY subset first and the trigger-flush chooser takes the
> first all-correct-side candidate → every "up to N target" trigger resolved as a silent no-op (native-classified,
> did nothing). Yao Guai's author had patched + documented it for ONE atom; the largest-first sort is now
> generalized to all subset atoms (side-gate intact — probed mixed boards both intents; EMPTY = last resort).
> **Effect: ~14 shipped natives now genuinely act at runtime** (Baloth Null, Gavony Silversmith, Kitesail Cleric,
> Elder Deep-Fiend, Nefashu, The Reaper…) **+ 5 new flips** (up-to-ONE anchor): Cormela · **Sword of Light and
> Shadow [Joe-Cap]** · Lethal Protection · True Ancestry · Walk with the Ancestors (Discover 4 runtime-verified).
> 5/5 skeptic-CONFIRMED (side-by-side baseline corpus diff; AI cast path provably unaffected; pod hash held for a
> verified STRUCTURAL reason). **Fence: suite 7,796 (+6) · lint 0 · trajectory `ab524e20` ×2.**
> **Session total (2026-07-05): +20 native across v0.103–106, LOST=0 throughout · 4 latent FP generators closed**
> (reminder-anchor drop · vacuous batch filters · restriction-dropping attacks matcher · empty-first subset pick).
> **NEXT (in flight): cost-tax static** (runtime-first mirror of collectCostReducers/costReductionForSpell at the
> legalChoices pricing chokepoint; taxes collect from ALL battlefields; simple shapes only — Thalia family).
> **Menu after:** k-descending subset enumeration (skeptic-flagged 64-cap truncation) · War-and-Peace hand-count
> metric · Toski statics · monarch.
>
> ── prior release (below) ──
> 🚀 **v0.105.0 — 2026-07-05 (Cindy, Fable 5). SHIPPED — Reyav attached-only attacks + SoFF conjunct (+5 native, LOST=0).**
> Slices `6b19a8e2` + `f60cfef7` + release chore; tag **`v0.105.0`** → release CI (verdict → CONTINUITY).
> **Slice A (attached-only attacks + that-creature referent):** the attacks subject matcher ANCHORED (was a bare
> substring test — any "a creature you control <restriction> attacks" silently dropped its restriction: a latent
> over-fire generator, now closed); "that's enchanted or equipped" modeled via descriptor `attachedOnly` (≥1
> attachment, enforced in scopeMatches); the entering/attacking pronoun rewrite accepts the spelled-out "that
> creature gets/gains" form (etb arm + attacks/creatureYouControl arm). **Flips (4/4 skeptic-CONFIRMED, 28/28
> runtime probes, independent full-corpus re-diff +4/LOST=0/MOVED=0):** Reyav [Joe-Cap], Ogre Battledriver,
> Primal Forcemage, Ardoz (union scope + activated lane live-probed; Ardoz's own minted token fires the union).
> **Slice B (the "you <verb>" second conjunct):** the untap-all-lands anchor accepts the and-compound's leading
> subject → **Sword of Feast and Famine** [Joe-Cap] native-equipment (runtime e2e: damaged player's discard
> pendingChoice + controller's lands untap; 4 stale FN pins re-specimened, intent preserved; skeptic verdict —
> see CONTINUITY).
> **Fence: suite 7,790 (+12 this release) · lint 0 · trajectory `ab524e20` ×2 (rows 5706, byte-identical).**
> **Session running total (2026-07-05): v0.103.0 +7 · v0.104.0 +3 · v0.105.0 +5 = +15 native, LOST=0 throughout;
> 3 latent FP generators closed** (reminder-anchor silent drop · vacuous batch filters · restriction-dropping
> attacks matcher). **NEXT menu:** Sword of War and Peace (their-hand damage metric) · Sword of Light and Shadow
> (GY-return conjunct) · cost-tax static (fattest corpus) · Toski statics · monarch (Pantlaza).
>
> ── prior release (below) ──
> 🚀 **v0.104.0 — 2026-07-05 (Cindy, Fable 5). SHIPPED — with-keyword batch combat-damage (+3 native, LOST=0).**
> Slice `8f1497cd` + release chore; tag **`v0.104.0`** → release CI (verdict → CONTINUITY). "Whenever one or
> more creatures you control WITH <keyword> deal combat damage to a player" is modeled end to end: carved out
> before the with-reject guard (keyword gated to FILTERABLE_ETB_KEYWORDS) · a new PER-DEFENDER pass in
> `checkBatchCombatDamageTriggers` (fires once per damaged player per the ruling, ctx = layer-aware MATCHING
> dealers' totals; Grim Hireling's once-per-controller semantics untouched + pinned) · the "X/X token where X =
> that damage" payload (`ptContext:"combatDamageAmount"`, outside the hasX gate) · multi-subtype batch lists
> ("Ninja or Rogue creatures") parse via a separator- AND qualifier-denylist-gated "creatures" strip.
> **Flips (3/3 skeptic-CONFIRMED w/ live probes):** Quartzwood Crasher [Joe-Pantlaza], Prosperous Thief +
> A-Prosperous Thief [Joe-Yuriko; Ninjutsu line = the documented bare-cost KW-NINJUTSU credit].
> **Two FPs killed before ship:** the suite's own guard caught the "colorless creatures" over-strip; the skeptic
> flagged the latent "red or green creatures" variant — both denylisted + pinned (`batchKeywordCombatDamage.test.js`).
> **Fence: suite 7,778 (+12) · lint 0 · trajectory `ab524e20` ×2 (rows 5706, byte-identical).**
> Prior evidence-ranked NEXT list (below, v0.103.0 block) still stands minus item ①: next = equip payload atoms
> (Reyav / War-and-Peace / Feast-and-Famine) · cost-tax static · Toski statics.
>
> ── prior release (below) ──
> 🚀 **v0.103.0 — 2026-07-05 (Cindy, Fable 5). SHIPPED — granted compound-keyword line (+7 native, LOST=0).**
> Master carries `2ce6a34a` (the slice) + the release chore; tag **`v0.103.0`** → release CI (verdict → CONTINUITY).
> **The slice:** the "Enchanted/Equipped creature [gets +X/+Y and] has <keyword(s)> and \"<quoted trigger>\"" line
> now models coherently across its three seams — `GRANTED_ABILITY_LINE` reaches past the keyword segment (+ strips
> reminder text pre-anchor, an audit-caught FP: Eternal Thirst was credited while extraction returned nothing → the
> runtime would never fire it), `parseAttachedClause` strips a validator-approved quoted tail so the keyword half
> parses as a layer-6 grant, and coverage adds a STATIC-HALF GUARD (parseAttachedBonus must parse non-empty).
> **Flips (7/7 CONFIRMED by refute-default skeptics w/ live runtime probes):** Power Fist [Joe-Wolverine],
> Web-Shooters, Take Flight, Staggering Insight, Eternal Thirst, Cathar's Call, Commanding Presence (+4 benign
> native-aura→native-trigger relabels: Consuming Fervor, Grasp of the Hieromancer, Infernal Scarring, Verdant
> Embrace). **Fence: suite 7,766 (+9) · lint 0 · trajectory `ab524e20` ×2 (rows 5706, byte-identical — flips
> outside the Tier-1 pod; nothing to re-baseline).** CREED guards pinned: Reaver Cleaver ("player or planeswalker"
> object), ungrantable keyword half, activated quote, trailing rider — all stay body-only.
> **📊 FRESH 13-deck census (2026-07-05, lands-in-denominator method — THE baseline going forward):** aggregate
> **73.9%** (1015/1373). Colton: Slivers 98.9 · Koma 93.3 · Vihaan 92.2 · Zaxara 91.5 · Omnath 90.9 · Rograkh 76.
> Joe: Ur-Dragon 75 · Kinnan 72 · Toph 69.1 · Pantlaza 64 · Yuriko 63.3 · Cap 63 · Mothman 57.4 · Kellan 55.3 ·
> Wolverine 51.8 (Power Fist adds +1 post-census). ⚠️ Counts LANDS in the denominator — prior per-deck %s used a
> different denominator; compare within-method only.
> **NEXT (evidence-ranked, from the combat-family probe of all 51 candidates):** ① batch group combat-damage
> detector ("one or more <filter> creatures you control deal combat damage" — runtime
> `checkBatchCombatDamageTriggers` EXISTS; needs a with-keyword filter + the trailing-"creatures" list fix +
> batch damage-total context + a scaled-token payload → Quartzwood Crasher [Pantlaza] + corpus; Prosperous Thief
> still blocked by ninjutsu) · ② attack/combat-damage payload atoms (Reyav double-strike grant · Sword of War and
> Peace hand-count damage · Sword of Feast and Famine discard+untap — each ~1 card, all on the existing
> equippedCreature trigger scope) · ③ cost-tax static (fattest corpus yield; needs real runtime cost-INCREASE
> enforcement) · ④ can't-be-countered + attacks-each-combat statics (Toski, corpus singles). Probe artifacts in
> the session scratchpad: `probe-combat` output, `system-rank.json`, `census-full.json`, `tier-base.tsv`.
>
> ── prior release (below) ──
> 🚀 **v0.102.0 — 2026-07-04 (Cindy, Opus 4.8). SHIPPED — Joe-shelf coverage (+6 native).**
> Master `618731f0` (ff-pushed, no PR gate this env this time), tag **`v0.102.0`** pushed → release CI **in progress**
> (run 28730962117; verdict → CONTINUITY). The two clean Joe-shelf slices, cherry-picked onto master `bec794d5`:
> **LEYLINE opening-hand pre-strip** (`460cf3f6` — CR 103.6 "begin the game with it on the battlefield" stripped in
> classifyCard; +4: Leyline Axe/Anticipation/Lifeforce/Vitality) + **Equip-legendary quality** (`95561644` — "Equip
> legendary creature {cost}" modeled, mirror of Equip-commander; +2: Excalibur, Blackblade Reforged). **Cap 61→63,
> Wolverine 58→59.** Fence: suite **7,757** green · lint 0 · **classification-tier ONLY → trajectory `ab524e20` holds**
> (flipped cards outside the Tier-1 pod; pod play byte-identical; nothing to re-baseline). Spent branch
> `claude/grind-etb-combat` = deletable (its commits are in master).
> **⛰️ GRIND CEILING:** the clean-grind tier is EXHAUSTED — Joe's decks sit at their honest 58–75% native ceiling; the
> rest is genuine Arbiter tail (ninjutsu / library-digs / play-from-zone / planeswalkers / crossover) + FP-prone
> dedicated systems. Next coverage = fresh careful mini-features (cost-tax static = fattest yield; Power Fist /
> counter-double = Wolverine; ninjutsu = Yuriko) with full adversarial verify — NOT marathon grinding.
> **📱 PHONE PORT:** Colton "phone plan is out"; Omnath same-day logged it on-hold-until-the-Mac-box. Not building now
> either way. Server box = Mac Studio, wait for M5 (`project_server_box_decision.md`).
>
> ── prior release (below) ──
> 🧩 **v0.101.0 — 2026-07-04 (Cindy, Opus 4.8). SHIPPED (tag `v0.101.0` on `122975af`, CI success — see CONTINUITY).**
> Landed as PR #413 (P3+P7+P9, `7f443b07`) + follow-up PR #414 (E4/Q4/D5, `122975af`), then tagged. Detail:
> The `orders/p3-p7-p9-backlog.md` chunk, all three additive Academy/Learn features, stacked on `d226091b`
> (v0.100.0): **P3 post-game debrief** (`0b5bf2fe` — the Academy result scrim tallies the player's own picks vs
> `metadata.suggestion`; the "un-strip decisionWire" premise was STALE like E1's — suggestion lives only on `ask`,
> already on the wire, so it's built off that + a pin test, no dead plumbing) · **P7 replay scrubber** (`9d7014be` —
> Table Records detail steps a finished game per-turn via `groupLogByTurn` + the shared `LearnLogEntry`; also fixed a
> latent P2 bug where `logTail.join("\n")` rendered `[object Object]`, and bumped record log capture 5→160 lines so
> there's a game to scrub) · **P9 puzzle mode** (`08bffb34` — Save-as-puzzle → `/api/puzzles` (store mirrors
> gameRecordsStore, reuses learnSaveSchema checksum/serialize guards) + `/api/learn/resume-puzzle` session-from-
> snapshot loader (fresh id, reuses `advanceUntilDecision`, `/learn/start` untouched) + a Puzzles list & result overlay
> driven by the pure, unit-tested `evaluatePuzzle`; v1 goal = win-this-turn).
> **FENCE: suite 7,744 (+19) · lint 0 · trajectory `ab524e20` ×2 byte-identical to the v0.100.0 anchor** (rows 5706,
> seed 1 — zero engine files touched; git-verifiable). Round-trip test proves serialize→restore→same board. **Verified
> LIVE in the preview:** P7 scrubber stepped T1→T2; P9 listed an injected real snapshot → Solve loaded the board+goal
> badge → passing the turn fired the "Puzzle failed" overlay; zero console errors throughout.
> **LANDING (Colton's call 2026-07-04): open a PR → merge → tag ONE release v0.101.0** (master-push is gated in this
> env). New app surfaces for Omnath tooling: `/api/puzzles` (GET list · GET ?id= · POST save-from-live-session) +
> `/api/learn/resume-puzzle` (POST {puzzleId}); Table Records `logTail` is now a fuller narrative tail (≤160). No
> engine/self-play/trajectory change — `ab524e20` holds; nothing to re-baseline.
>
> **THEN (same session, Colton "do all recs · full rights"):** folded three more into PR #413 →
> **E4 durable color tags** (`e76da578` — definitions move to the server `/api/color-tags` →
> `profilePath("color-tags.json")`, the U-F4 durable fix; localStorage demoted to a write-through sync cache
> reconciled server-wins on mount; new `colorTagStore.sanitizeTags` unit-tested; +6 tests) · **Q4 LEYLINE
> alias sweep** (`dbfe8851` — 31 legacy Aether-token usages → `--ley-*` across 5 components + the 37-line dead
> alias block deleted; 0 refs verified before removal; MTGAssistant hand-hex was already fixed) · **D5** Garfield
> doc refresh. Suite **7,750** · lint 0 · **still zero engine deltas** (`ab524e20` holds by construction). New
> surface: `GET/PUT /api/color-tags`. **DEFERRED (deliberate):** D1 archive move (cosmetic + cross-doc
> link-risk), D2 TODOS/ROADMAP delete (Colton's files), D3 mobile (parked on Colton), D4 tray-eyeball (manual
> .exe). E2/E3 AI-tuning stays PARKED on evidence. **PR #413 now = P3+P7+P9+E4+Q4/D5 → v0.101.0 on Colton's
> merge** (self-merge is harness-blocked; needs his click).
>
> ── prior release (below) ──
> 🚀 **v0.100.0 RELEASED — 2026-07-04 (Cindy, Opus 4.8) — the full P5→K→release run, after the engine-tail pass below.**
> Shipped to master + PUBLISHED (signed `.exe` + `latest.json`, all 3 CI workflows green): **P5 reality report** COMPLETE
> (route `analyze` flag `c944acd5` + DeckReport UI `73dc0f98`) · **K4 tokens/meld + K9 flavor + K5 combo steps** (`f1bbb4c0`
> — populate at the next data sync; K4/K9 at this release's index build, K5 at the next weekly spellbook sync) ·
> **housekeeping** (swept `_flipbase` + `friendly-golick` worktrees junction-safe, main `node_modules` verified intact;
> CHANGELOG current) · **release** (`9b4a4cd2`, tag **v0.100.0**, bumped from 0.99.0; CI SUCCESS 23m45s — all 5 assets
> published, auto-updater live). Health sweep: Next production build ✓ · suite **7,725** · lint 0 · ci+rust CI ✓. Nothing broken.
>
> **NEXT (Colton's plan, post-release):**
> - **P3 debrief** (recon'd — moderate, NOT purely client-side): `decision.metadata.suggestion` EXISTS but is wire-STRIPPED
>   for pending-choice kinds (`decisionWire.js` `PENDING_WIRE_FIELDS` whitelist — add `metadata`/a slimmed `suggestion`);
>   then LearnView accumulates the user's pick vs the suggestion + shows a debrief at the result scrim (`LearnView.jsx` ~:367).
>   `/api/learn/step`+`/choose` return `decisionViewForWire(...)`; non-pending decisions already pass metadata through.
> - **P7 spectate + P9 puzzle** — LAY OUT WITH COLTON (P7 = a replay viewer over the Table Records data; P9 = a live-session
>   snapshot exporter). **Roadmap planning** — with Colton. Other backlog: E4 color-tags, D archive (the `friendly-golick`
>   orphan dir lingers locked — clears on reboot).
>
> ── prior pass (below) ──
> 🔧 **ENGINE-TAIL PASS — 2026-07-04 (Cindy, Opus 4.8) — E1 + P5-analyzer SHIPPED · E2/E3 PARKED (evidence) · ENGINE-WRITE lock LIFTED.**
> **E1 earthbend-return** (commit `a2dfdc34`, on master, UNTAGGED — releases batched with E2/E3): the CR 603.7
> "when it dies or is exiled, return it tapped" rider is now enforced (`combat.applyEarthbend` flags the animated land →
> `triggers.checkLeavesTriggers` synthesizes a delayed trigger → `zones.applyEarthbendReturn`, `enterCardFromZone` tapped,
> fires landfall). Fence: **suite 7,718** (+7) · lint 0 · tier flip-diff **LOST=0/GAINED=0** (0 tier changes — the
> earthbend permanents were ALREADY native safe-FN partials, NOT the 34-card flip the stale order/CAP assumed; the
> reminder count-strip had already shipped. `retired-fp-ledger.md` CAP corrected) · trajectory byte-identical before/after.
>
> **⚠️ TRAJECTORY ANCHOR RE-BASELINED: `a2a03ba8` (v0.88.0, doc) → `ab524e20` (current, reproducible ×4, rows 5706, seed=1).**
> Root-caused BENIGN: `git diff v0.88.0..master -- app/src/lib/learn` is EMPTY (engine byte-identical) + the deck-loader is
> too, so the change is DECK-DATA drift (Colton's profile `prof_a981996c` edited 2026-07-04; rows 8281→5706), NOT a code
> regression. **`ab524e20` is the honest pre-E2/E3 anchor — E2/E3 re-anchors FROM it, not from the stale `a2a03ba8`.**
>
> **🅿️ E2/E3 AI-TUNING — PARKED ON EVIDENCE (do NOT re-anchor; `ab524e20` holds).** A/B baseline
> (`play-quality-probe.mjs`, standard·mirror·seed=7·legacy=all, 60 games, reproducible ×2): NEW(shipping default)
> **58.3%** vs OLD(v1) 41.7% — the AI is ALREADY strong. altCost isolated (`--legacy=altCost`, 2 seeds): standard 1v1
> NEW **46–49%** vs OLD 51–54% (current altCost marginally net-NEGATIVE in 1v1); commander NEW 66.7% vs OLD 33.3%
> (net-POSITIVE in the pod — the real use case). Read: the tune is marginal + noisy + needs a risky card-specific value
> heuristic (a wrong HOLD is its own bad play), and it's already net-positive where it matters. Per "ship only if clearly
> up + don't regress the real case," **E3 doesn't clear the bar; E2's offered-X-subset re-anchors every deck for a
> similarly narrow gain** — both parked. The A/B harness is proven + wired for a future attempt (`--legacy=<key>`,
> `altCost`/`xSizing` arms in `opponentAI.POLICY_KEYS`); re-open only with a decisive-signal design (bigger samples, or a
> specific logged bad-decision to target).
>
> **✅ P5 (reality report) — FOUNDATION SHIPPED** (commit `e6c3379d`): the post-game analyzer promoted to a shared lib
> `src/lib/learn/gameAnalysis.js` (`analyzeGame` + `summarizeSeatReality` — per-deck dead-turn rate / avg casts·lands /
> mulligan rate / avg X), consumed by the A/B probe (de-drifted) + the future route. Suite 7,724 (+6), lint 0, trajectory
> `ab524e20` ×2 (behavior-neutral). **NEXT (app-side, no engine lock):** P5 Part 2 = a self-play `analyze` route over a
> `record:true` batch → `summarizeSeatReality`; Part 3 = the DeckView report surface. Then P3 debrief, E4 color-tags, K-items.
>
> ⚠️ **SYNC NOTE — 2026-07-04 post-merge:** current version is **0.99.0**; suite is now **7,718** (E1 added 7; was 7,711).
> A parallel chat shipped collector UX + full-card frames as 0.96-0.99 (a version collision:
> my tags v0.96-0.98 point at E5/P4/P8, their v0.99.0 at the collector UX). **BOTH are in
> master** — E5/P4/P8 code all present. Engine byte-identical v0.88.0→master (git-verified); the historical
> `a2a03ba8` no longer reproduces on current decks — see the anchor re-baseline above. Numbers below that say 7,703/7,711 are pre-E1.

# 🌅 WAKE REPORT — 2026-07-04 (backlog tail cont. — v0.96→v0.98: E5 + P4 + P8)

> After the questions (Colton: E5→owning-profile · AI-tuning→yes-with-evidence · releases→per-feature),
> shipped three more additive wins: **v0.96 E5** cross-profile rating persistence (POST
> /api/pod-balance/rate → writes into the owning profile; proven safe on both file shapes) · **v0.97 P4**
> matchup ledger (per-game sidecar rows + /api/self-play?action=matchups + a head-to-head heat table in
> Pod Balance) · **v0.98 P8** mulligan lab (seeded deal + engine-verdict compare in DeckView). Suite
> 7,703 + lint 0; **engine untouched** (zero lib/learn deltas; trajectory a2a03ba8 holds).
>
> **THE CLEAN-ADDITIVE TAIL IS NOW EXHAUSTED.** What remains needs FOCUSED FENCED PASSES, not
> marathon-tail grinding — each specced in [UPGRADE-BACKLOG.md](UPGRADE-BACKLOG.md) STATUS with recon:
> - **E1 earthbend** (delayed dies/exile-return trigger; flips ~34 permanents incl. Toph native) —
>   recon: tractable via the selfReturn.js template + enterCardFromZone; STRICT ORDER (build the return
>   FIRST, THEN strip reminders in coverage.js:179 shaped-count, or the 34 flip to dropped-rider FPs —
>   see retired-fp-ledger.md CAP). Full battery + flip-diff GAINED=the 34 named + e2e (Toph returns tapped).
> - **E2/E3 AI tuning** (Colton GREENLIT with evidence) — re-anchors trajectory; need play-quality A/B
>   probe (play-quality-probe.mjs --legacy=KEY) + a v1 legacy arm. Omnath re-baselines self-play data once.
> - **P5 reality report** — promote analyzeGame (play-quality-probe.mjs:186) to a shared lib + a route
>   analyze-flag over a record:true batch; never-cast needs recordDecisions. **P3 debrief** — thread the
>   v1.1 act-opts bag through /api/learn/step+choose. **P7 spectate** needs the P2 replay viewer; **P9
>   puzzle** needs a live-session snapshot exporter. **E4** color-tags server-side (rewrite risk).
>   **K4/K5** data-at-sync. **K9** no flavor source. **D** archive move (cosmetic).

# (previous report below — the v0.89→v0.95 backlog push)

# 🌅 WAKE REPORT — 2026-07-04 (the backlog push: v0.89.0 → v0.95.0, 8 releases, Opus at the helm)

> **"Do all next best remaining" → "keep pushing through the entire backlog":** after the
> Vault/Trophy/Records/Gallery run (v0.89-0.91), Colton swapped Fable→Opus and ordered the
> whole backlog. Shipped **v0.92-0.95** on Opus (per MASTER-GUIDE §2 — the expected post-Fable
> seat): **Judge Trials + The Library + formatted chat + universal shopping list + finish
> analytics** (v0.92) · **local card inspector + command palette** (v0.93; fixed a real
> printings-API key bug that had silently broken the v0.90 artist-autofill) · **binder view +
> continue-strip** (v0.94) · **practice-this-deck + cost basis** (v0.95). Suite **7,703** +
> lint 0 throughout. **ENGINE PROVABLY UNTOUCHED across all 8 releases** — zero
> `app/src/lib/learn` deltas since v0.88.0; trajectory hash a2a03ba8 ×2 at close + tier fp
> 0-diff.
>
> **What's LEFT is the evidence-heavy tail** — every remaining item is either engine-behavior-
> changing (needs A/B probe evidence: E2/E3), a bounded engine fix that needs its own fenced
> pass (E1 earthbend), an additive engine/harness export (P3/P4/P5/P8), a real project
> (P7 replay/P9 puzzle), data-lands-at-sync (K4/K5/K9), a working stopgap (E4), or Colton's
> call (E5). **All specced with reasons in [UPGRADE-BACKLOG.md](UPGRADE-BACKLOG.md) STATUS.**
> The rapid app-side backlog is DONE; the rest is deliberately left for focused passes.
>
> Dev-tree residue (gitignored, harmless): seeded cards + a synthetic printings-index in the
> Player-1 profile (used to walk Gallery/Trophy/Binder/cost-basis).

# (previous report below — v0.89-0.91 wave-V + Trophy + Gallery/Records)

# 🌅 WAKE REPORT — 2026-07-04 (v0.89.0 wave-V+Q · v0.90.0 Trophy Case · v0.91.0 tail: Gallery + Records + Prove-the-Pod)

> **v0.91.0 ("do all next best remaining", same finale session):** **V7 THE GALLERY** (5th
> Vault door — collection by printing artist via new `/api/collection/artists`; drawer
> "Use printing artist" autofill; honest pre-V5-index fallbacks) · **P2 CORE — TABLE
> RECORDS** (4th Proving Grounds door; Academy games PERSIST at game over via
> `gameRecordsStore` + `/api/records` — the step/choose terminal blocks write the record
> before dropping the save; list→detail with the narrated tail) · **P1 Prove the Pod**
> (20 real games from Pod Balance → empirical seatSummary + rated-vs-wins line) · **Q7**
> SeatSummaryTables in Sim Center results · **Q3** DeckReadyView post-import moment ·
> **Q8** per-message Copy/Save chips (locked-deck-safe) · **Q9** pod→sim handoff
> (consume-once initialSelection) · **Q4-lite** shell hand-hex → tokens. Suite **7,696**
> + lint 0 · fence a2a03ba8 ×2 + tier 0-diff (3rd time this session). PARKED: P2 replay
> scrubber + self-play records + game-log merge (backlog P2 note) · Q4 full alias sweep ·
> Q7 report-history trend · Q9 reverse link · V7 artist filter token. Dev-tree residue:
> synthetic printings-index seed + Sol Ring trophy row (Gallery/Trophy walk demos).

> **v0.90.0 (same finale session, "do your next best moves"):** **V6 THE TROPHY CASE** —
> additive provenance fields on collection rows (`signed {artist,date,event,inPerson}`,
> `altered`, `artistProof`, `showcase`) through validateProvenance + the PATCH whitelist;
> the drawer's Provenance section; the ★ showcase hero strip atop The Stacks (art tiles +
> caption). **V5** — printings-index schema now carries artist/fullArt/borderColor/
> storySpotlight (builder + docs + pins; fields land in bundles at the NEXT CI index build —
> verify in the v0.90.0 release log; local dev has no bulk so no local rebuild). Suite
> **7,693** + lint 0 · fence a2a03ba8 ×2 + tier 0-diff AGAIN · PATCH round-trip proven live
> (400 on unknown signed field, 200 + persisted on good payload). Dev-tree residue: one
> seeded "Sol Ring" trophy row in the dev profile (walk demo; delete from the drawer if it
> annoys). Parked → V7 session: artist autofill in the drawer · the dedicated showcase
> surface/door · Gallery.

> **v0.89.0 (Colton fired orders/vault-overhaul.md + UPGRADE-BACKLOG wave Q, Fable 5 finale
> session):** the Vault got the kiosk IA — **VaultHome** front door with four LIVE door-panes
> (The Stacks / The Ledger / The Atlas / The Forge) + the Pulse strip; the 5-tab strip and
> mode state are DEAD (CollectionView takes a `surface` prop; per-surface toolbars; Finance+
> Stats merged into the scrolling Ledger; all four Vault*Views on LEYLINE glass) · **V2**
> Ledger value area-chart (ranges + crosshair) · **V4** Atlas completion bars + % +
> cost-to-complete · **V9** `GET /api/collection/combos` + The Forge combo shelf (owned
> combos + one-card-away, priced) · **wave Q**: Q1 useEscapeClose across 10 overlays ·
> Q2 powerRank on DeckView/DeckMenu + `serializeDeckMemory` "Machine Power Rating" line
> (agents see it; +3 pins) · Q5 session filter · Q6 pod salt (saltSum/saltTop additive).
> **Suite 7,684 + lint 0 (bare exit codes) · FENCE PROVEN: tier fp byte-identical 0-diff +
> trajectory hash == a2a03ba8 ×2 (games=3 rows=8281, AppData root).** Preview-walked:
> landing → all four doors → back; Escape closes Add-card live.

## ⚠️ PARKED (this pass)
1. **Vault tail (all spec'd in [UPGRADE-BACKLOG.md](UPGRADE-BACKLOG.md) wave V):** V5
   printings-index schema pass (artist/reserved/flavor — GATES V6 autofill + V7) · **V6
   Trophy Case (impact 5 — the collector headline; give it its own focused session)** ·
   V7 Gallery/artists · V8 binder mode · V10 cost basis · V11 universal shopping list ·
   V12 finish analytics.
2. **Wave Q tail:** Q3 post-import "deck ready" moment · Q4 alias sweep + the
   MTGAssistant:732 hand-hex fix · Q7 seatSummary tables in Sim Center · Q8 per-message
   chat actions · Q9 pod⇄sim round trip · Q1-stretch (Escape walks up the IA, Ctrl+1/2/3).
3. **Carried from earlier passes:** tray-click eyeball on first launch · mobile IA pass
   (Colton: ever under 660px?) · cross-profile rating persistence (Colton call, by-design
   today) · dev-tree art-crop 404s (cosmetic, installed exe has the cache) · legacy alias
   block in globals.css (Q4 covers it).

## 🔁 How the next session resumes
Method index + post-Fable model policy: [MASTER-GUIDE.md](MASTER-GUIDE.md). Forward queue:
[UPGRADE-BACKLOG.md](UPGRADE-BACKLOG.md) — next best: **V6 Trophy Case** (after V5) or wave
Q tail or P1/P2 records. The grind resumes per memory/orders/clyde-grind-relaunch.md when no
feature wave holds the lock. UI law: ui-overhaul-log.md §0. Engine anchors: suite 7,684 ·
tier fp 0-diff vs main · trajectory a2a03ba8 (rows 8281).

---

# (previous report below — v0.88.0 wave 2)

# 🌅 WAKE REPORT — 2026-07-04 (LEYLINE wave 2 — v0.88.0: kiosk IA + Proving Grounds + power-rank fixes)

> **v0.88.0 (Colton-ordered wave 2, same session as v0.87.0):** the kiosk LANDING screen
> (3 registry-driven area doors + bottom AreaBar; `docs/HOW-TO-ADD-AN-AREA.md` = the no-AI
> extension guide) · **The Agents** (3 pixel-art squares → chat; Decks ▾ header menu; desktop
> nav sidebar retired) · **The Proving Grounds** umbrella (Academy · Sim Center · **Pod Balance
> as a surface**: all-profile decks, compare ≤4, Rate + auto-rate-on-import →
> `memory.powerRank`) · **power-rank X fix** (X floors at 1 in curve/ramp/cantrip/combo paths;
> + assumedX name-only, MDFC front-face X, interaction-axis 14+→3, `Commander:` headers) ·
> originGuard dynamic loopback same-origin. Battery **7,681** + lint 0; fence: hash
> `a2a03ba8` + tier 0-diff AGAIN. Parked from wave 2: mobile IA pass (sidebar survives
> mobile-only) · cross-profile rating persistence (session-only for other profiles) ·
> powerRank not yet in agent prompt serialization · speed-axis `||` ordering (debatable,
> documented in ui-overhaul-log W3).

# (wave 1 report below) — 2026-07-03 (LEYLINE UI/UX OVERHAUL pass — v0.87.0)

> **v0.87.0 = the LEYLINE UI overhaul** (the third Fable 5 pass, one-owner lock, UI-ONLY —
> the engine is fence-proven untouched). The whole app moved from Aether cyan to **LEYLINE**:
> green energy through dark glass — true-black surfaces, phosphor-green glow-as-hierarchy,
> glass panels, ONE button system. Suite **7,661** green · lint clean · engine anchors hold
> (tier fp 0-diff, trajectory hash == `a2a03ba8…` ×2). THE two docs to read:
> [ui-overhaul-log.md](ui-overhaul-log.md) (wave-by-wave + numbers) + the before/after gallery
> in [ui-overhaul/](ui-overhaul/) (INVENTORY.md + baseline/ + after/).

## What shipped (v0.87.0)
- **The LEYLINE design system:** `--ley-*` tokens in `globals.css` (surface ramp, green ramp,
  glass recipe, glow discipline, motion scale) + THE BUTTON SYSTEM (`.btn` ×
  primary/secondary/ghost/danger × sm/default/lg + icon/loading/disabled/focus states). Hidden
  `/styleguide` route = the living reference. Display font: Space Grotesk (Playfair retired).
- **Kiosk shell:** nav shows where you are (green actives — previously nothing highlighted),
  bigger targets, tracked-caps mono labels, versioned window title ("MTG Tool v0.87.0"),
  phosphor loading screen.
- **Every surface converted** (6 file-disjoint lanes, worktree-per-builder, each battery-gated):
  chat + sessions + Garfield · Academy board + all 14 decision side-sheets · Sim Center · the
  Vault (5 modes + 8 modals) · deck views/import/lock modals · updates/settings/onboarding/
  profiles/feedback. ~214 button sites → `.btn`; 219 off-token colors → 0 (identity/data uses
  excepted); empty states all lead somewhere.
- **Agent identity sharpened:** system chrome always green; agent colors only on identity
  elements. **Jace = arcane blue #6ab8ff now** (cyan was Aether's accent, not his identity).
- **Acceptance:** real .exe built (0.87.0) — title/single-instance/Job-Object teardown proven
  at the process level; packaged UI walked against the exe's own server with real AppData.

## ⚠️ PARKED (carry forward)
1. All v0.86.0 parked items unchanged (see the previous WAKE-REPORT section in git history /
   play-harness log §parked: decision.seat MINOR · AI free-spell holds · paid-alt for 6
   non-interaction carriers · offered-X-subset quality · SD-8 façade split · HB-9/HB-11 ·
   ENG-FLAG-2 · detectArchetype memo · land-tier metric call · fail-closed Spellbook guard ·
   U-F4 color-tag stopgap · prof_65a43f93 re-registration · grind resumes per
   memory/orders/clyde-grind-relaunch.md).
2. From this pass (UI):
   - **Tray-icon interactive walk**: tray/close code untouched (only a `set_title` in setup)
     and the shell launches/quits clean, but the literal tray-click walk wasn't exercised
     (computer-use denied this session) — 30-second eyeball on first launch.
   - **Escape-to-close on modals**: kiosk-worthy, small behavior addition — deliberately out
     of this restyle-only pass.
   - **Card-art 404s in dev tree**: `/api/art-crop` misses for uncached cards in dev (pre-
     existing; installed exe has the cache). Cosmetic in dev only.
   - **Dev-tree walk residue**: a test deck "Omnath Baseline" + one saved Academy game live in
     the dev tree's Player 1 profile (created during baseline screenshots) — harmless; delete
     from the sidebar if it annoys.
   - Legacy Aether token ALIASES still map old names → LEYLINE values in globals.css
     (components reference both vocabularies); a rename-sweep to pure `--ley-*` is cosmetic
     debt, zero user impact.

## 🔁 How the next session resumes
Engine work: read PLAY-HARNESS-OVERHAUL-PLAYBOOK §5 + OVERHAUL-PLAYBOOK §5 never-lists; the
grind resumes per memory/orders/clyde-grind-relaunch.md (unchanged by this pass). UI work:
compose from `/styleguide` + `--ley-*` tokens — never hand-hex, one primary per surface, glow
= hierarchy. The button system is law: no new one-off button styles.
Method index + post-Fable model policy: [MASTER-GUIDE.md](MASTER-GUIDE.md). Forward feature queue:
[UPGRADE-BACKLOG.md](UPGRADE-BACKLOG.md) — flagship ready to fire: `memory/orders/vault-overhaul.md`
(the Vault kiosk overhaul).
