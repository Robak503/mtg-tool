# CoverageRun — the consolidated one-chat coverage build (operating spec)

> **Supersedes the 4-chat faculty model.** Clyde is the **sole orchestrator + sole master-writer**;
> builders are sub-agents *under* the orchestrator, not separate chats. Omnath = WHAT/WHY; Clyde =
> HOW/WHEN + all engine/app code + master. **Live state derives from `git` + `STATUS.md`, never this doc.**
> Pairs with the source design: `omnath-tools/CODEX_one-chat-build-blueprint.md` + `CODEX_throughput-optimization.md`.

## Decisions (locked 2026-06-26, Colton)
- **Metric = DEPTH primary:** the 13 training decks play end-to-end, zero Arbiter deferrals (named carve-outs
  only, e.g. Chain of Vapor). Corpus-% is the *trunk proxy*, pumped in parallel — not the north star.
- **Topology = ONE orchestrator (Clyde).** No separate 2nd top-level agent (quality-first = smallest
  coordination surface; the coverage.js/triggers.js convergence makes a 2nd writer a hazard). Builders fan
  out as sub-agents under the orchestrator. **Single master-writer.**
- **Spend = balanced** (quality > throughput; time is not the constraint): big batches amortize the
  O(corpus) fingerprint cost; moderate fan-out; hard checkpointing. Wide 8–16 fan-out is *avoided* — it
  raises the FP + shared-file-contention surface.
- **Autonomy = full, heads-down:** auto-merge the narrow/anchored tail behind the deterministic gate
  (self-calibrate by human-sampling my own first ~20). **Invariants kept regardless of trust** (safety, not
  taste): never force-push master, never commit `~/.tauri` keys, **CREED — a false-positive is FORBIDDEN**,
  and **releases to the signed auto-updating .exe** are cut only at clean milestones *with guard-kit proof in
  hand + a heads-up before the tag* (that node reaches every install in 24h).

## The guard kit — load-bearing checks live in CODE, not agent prose (the fabrication lesson)
All four are committed, headless (`MTG_APP_ROOT=<main-tree>/app`), deterministic, builtins-only:

| tool | what it diffs | the gate it is |
|---|---|---|
| `app/scripts/tier-fingerprint.mjs` | `classifyCard` tier per card | cheap **necessary** flip-diff for ordinary slices (audit every body-only→native flip) |
| `app/scripts/program-fingerprint.mjs` | canonical `parseEffectClause` output (spell + triggers + activated + `programConfidence`) | the **seam acceptance gate (R1)** — necessary **and sufficient** for "no resolution change"; catches a same-tier op-rebind (`fight→deal-damage`) the tier diff is blind to |
| `app/scripts/runtime-fingerprint.mjs` | `manaProduction` / `doublerProfile` / `isPureDoubler` per card | the **resolver-output guard** — catches runtime-only changes (the phantom-mana / doubler FP class) on cards that never flip tier |
| `app/scripts/allowlist-guard.mjs` | `COVERED_KEYWORDS` + qa-sweep allowlist sets, working vs `origin/master` | **R2 tamper guard** — any added member = AUTO-REFUTE until enforcement is independently confirmed (a slice can't self-certify a keyword) |

Diff recipe: run a tool on the merged tree + on a `git worktree add --detach <base-SHA>` baseline, `diff`.
The scripts are committed, so the orchestrator invokes them itself — no agent hand-writes the load-bearing check.

## The gate (per slice / wave)
1. **Build** — sub-agent, model the WHOLE card (CREED all-or-nothing), ultracode OFF *inside* the builder.
2. **tier-fingerprint** diff — audit every body-only→native flip; out-of-native = FP removal (good).
3. **program-fingerprint** diff — for any parser/recognition change: byte-identical over 34,160 = behavior-preserving.
4. **runtime-fingerprint** diff — for any manaModel/replacementEffects slice.
5. **allowlist-guard** — for any keyword slice: addition → auto-refute pending enforcement confirm.
6. **Adversarial REFUTE sweep** on new waves / broad matchers — skeptics prompted to refute, must QUOTE the
   dropped clause + runtime-probe; the **script re-runs the actual resolver** (the final assert is JS, not prose).
7. **`npm test`** (confirm the literal "Tests N passed" line — the wrapper false-greens on a crash) + **lint**.
8. **ff-merge** (see protocol) → refresh `STATUS.md` + `fp-watch.md` + `coverage`. Honest coverage may dip when
   a wave removes FPs — that's a win.

## Master-write protocol (sole writer)
- ff-only, never force. **ff-guard:** `git fetch origin && git merge-base --is-ancestor origin/master HEAD` →
  `git push origin HEAD:master`.
- **On divergence** (another writer during transition): `git rebase origin/master`, re-verify ff-guard, push.
- **Idempotency / dedup key = the `[squash #NNN]` commit marker**, NOT `--is-ancestor`. A squash replays a
  branch as one new commit, so an integrated branch is a NON-ancestor of master and GitHub still shows it
  MERGEABLE/CLEAN. Resume/dedup off `git log master | grep "[squash #NNN]"`. **Every integration carries a PR
  number** so the no-op dedup key always exists.
- Never `git stash` / `git add -A` / `git clean` on the shared `.git`.

## Phase sequence
- **Phase 0 — DONE** (master `65088f8`): consolidate + commit the guard kit (the 4 tools above).
- **Phase 1 — IN PROGRESS: the parser.js matcher-registry seam.** Lift the ~149 inline `parseExtendedAtom`
  branches into registered `CLAUSE_PARSERS` modules in **small batches**, mirroring the `atoms/*.js` families.
  **Acceptance per batch = `program-fingerprint` byte-identical over all 34,160 cards** (a pure refactor) —
  mechanically proves the "priority order preserved exactly" requirement the tier diff cannot. The seam is the
  throughput gate for wide fan-out; the integrator-wall win (concurrent verify, serial ff-push) is already
  delivered by the one-chat pipeline and is seam-independent.
  - ✅ **Batch 1 (`312a273`): EXPLORE migrated** → `atoms/library.exploreClauseParser`. program-diff = 0,
    4222 tests green. Methodology PROVEN — extract → register → program-fingerprint byte-identical → ship.
  - ✅ **Batch 2 (`d91c72b`): parseHelpers leaf** — `SMALL_NUM`/`NUM_WORD` extracted to `effects/parseHelpers.js`
    (pure, imports nothing) so matcher modules can consume them cycle-free. program-diff = 0.
  - ✅ **Batch 3 (`4173dd7`): PROLIFERATE + GAIN-EXPERIENCE migrated** → `atoms/counters.js`; gain-experience is
    the first family to consume the parseHelpers leaf (proves the cycle-free pattern). program-diff = 0.
  - **Key insight:** a migrated branch moves from the inline (priority) path to the `CLAUSE_PARSERS`
    (post-`parseExtendedAtom`) path, so it is behavior-safe ONLY when its clauses match no other matcher;
    `program-fingerprint` proves that per batch. Whole-clause-anchored families are safe; overlapping ones need
    order-preserving handling.
  - **NEXT:** earthbend + rad need the count-source machinery (`parseCountSource` + its `COUNT_*` maps) —
    extract that to the parseHelpers leaf as a (bigger) batch, then migrate earthbend/rad. The big families
    (pump/tutor/counter/draw/bounce) have more complex regexes with double-match potential — migrate each
    behind the program-fingerprint gate, which refuses anything that isn't a true byte-identical no-op.
- **Phase 2 — prove ONE clean wave** end-to-end through the consolidated machine (build → fingerprint verify →
  gate → ff-merge) on real cards. **Only after this passes do faculties wind down.**
- **Phase 3 — widen fan-out** on disjoint atom-families (collision-free post-seam).

## Autonomous loop (Colton granted a long unattended run 2026-06-26 — "see how far you can go")
Each wakeup re-enters FRESH (no memory of the prior turn) and is fully driven by this file + git. Protocol:
1. **Re-derive state:** `git fetch origin --prune`; confirm clean tree on the session branch; read this file's
   Phase-1 batch list (what's done / next) + `gh pr list --state open` (new builder PRs).
2. **Pick ONE action (priority order):** (a) a NEW builder PR (#381+) opened → integrate it through the gate
   (tier + program + runtime fingerprints as applicable, adversarial sweep on a wave, `npm test`+lint, ff-merge);
   (b) else → migrate the NEXT seam family (queue below); (c) else if seam done → Phase 2 (prove one wave).
3. **Gate (hard):** for a seam batch, `program-fingerprint` MUST be byte-identical over 34,160 vs the pre-batch
   `origin/master` (baseline via `git worktree add --detach <sha>`). **Not byte-identical → DO NOT SHIP:** revert
   the batch, log the family as "needs order-handling" here, move to the next family. Never force a non-identical
   seam merge. `npm test` ("Tests N passed") + lint green before push.
4. **Record + re-arm:** update this file's batch list AND refresh the `<!-- AUTORUN -->` block at the TOP of
   STATUS.md (the dashboard data source Omnath renders, so Colton can watch without interfering) — overwrite the
   whole block: master SHA, batches shipped, the FLAT-BY-DESIGN card note (the seam adds 0 cards — never imply
   card growth from a refactor), FP-hunt status, next batch. Commit (explicit paths) + ff-push, delete temp
   worktree/files, then ScheduleWakeup with the same continuation prompt. Keep going until a STOP condition.
4b. **FP-HUNT cadence (standing — the CREED is the whole point, not just the seam gate).** The seam batches are
   byte-identical refactors (can't add/fix FPs). Separately, every ~5 batches (or whenever the seam queue is idle),
   run a real FP-hunt on the LIVE coverage: `node scripts/qa-sweep.mjs` (+ `keywords`/`spells`/`triggers` arms) and
   `node scripts/allowlist-guard.mjs` + `runtime-fingerprint` drift vs a recent master. Confirm suspects adversarially
   (refute-prompted fan-out OK — Colton approved read-only agents); a CONFIRMED FP (native card that drops a clause /
   mis-resolves / over-fires) → fix at the gate (tighten matcher + regression test + program-fingerprint/flip-diff) or
   log to fp-watch.md / retired-fp-ledger.md. A NEW builder PR's coverage always gets the full FP gate (this is the
   integrator job, never skipped). Log the sweep outcome in fp-watch.md so the cadence is auditable.
5. **STOP conditions (surface to Colton, do NOT proceed):** a RELEASE tag is warranted (heads-up + proof first —
   never auto-tag the signed .exe) · a genuine architectural fork with no obvious answer · two consecutive
   families fail the gate for the same structural reason (precedence design needs a human call). Usage-limit kills
   are NOT a stop — the run resumes from git + this file on the next session.

### Seam family migration queue (easy → hard; reorder freely as the gate dictates)
- ✅ explore · ✅ proliferate · ✅ gain-experience (batches 1–3) · ✅ count-source machinery → parseHelpers leaf
  (batch 4, `01065a9`) · ✅ earthbend → atoms/combat (batch 5, `2405dfb`). All program-diff = 0.
- **📋 FULL MAP: `docs/orchestration/seam-migration-map.md`** (4-agent recon — every remaining op's branch lines,
  deps, resolver home, risk, couplings, and the readiness-ranked Wave A→D order). Execute it top-down; re-grep
  `op:"<op>"` each batch (line numbers drift). ✅A1 library-keywords (batch 6 `d45aaa4`) · ✅A2 combat-keywords
  (batch 7 `fb7b5a4`) · ✅A3 fog/divide-damage → misc (batch 8 `11d4b68`) · ✅A4 self-attach/attach-to-self →
  stack (batch 9 `79cd743`) · ✅A5 tuck → zones (batch 10 `7167e70`) · ✅A6 mill → library (batch 11 `2560c6e`) ·
  ⏸️A7 counter **DEFERRED** (batch-12 attempt reverted, program-diff=16 — rider-folding entanglement; see map). **Wave A
  done (6 shipped, A7 deferred).** **NEXT = FP-hunt** (cadence due — ~5 batches since the last full hunt: qa-sweep +
  allowlist-guard + runtime-fingerprint drift, adversarially confirm, fix/log). Then **Wave B** (helper-leaf
  extractions: parseGrantedKeywords→pump, tutor helpers→tutor) · Wave C (interleaved families: lose/gain-life,
  draw+discard, rad player-grant, destroy⇄exile, add-counter, create-token(s), animate, deal-damage, rfg⇄reanimate,
  sacrifice). Note: pump/tutor (Wave B) are the LAST big monolith chunks; after them parseExtendedAtom is largely drained.
  **Wave B COMPLETE:** ✅ B1a parseGrantedKeywords → leaf (12b `7bd7820`) · ✅ B1b pump → atoms/combat (12c
  `483f0ac`, the biggest chunk) · ✅ B2a tutor-helpers → leaf (12d `beb5cfc`) · ✅ B2b tutor → atoms/library.tutorClauseParser
  (12e `d0f2890`, program-diff=0 — 6 contiguous blocks tm/ttm/bfm/mf/spm/lfh, first-match order preserved; parser.js
  dropped the now-unused parseTutorMv/BASIC_LAND_SUBTYPES/UP_TO_N_WORD imports, kept parseTutorFilter for the rd block).
  Also ✅ FP-HUNT CHECKPOINT #3 logged (CLEAN by no-drift proof; runtime FP surface git-verified untouched since hunt #1).
  **Wave C IN PROGRESS:** ✅ rad player-grant → atoms/counters.radClauseParser (batch 13 `2c0e967`). ✅ animate →
  atoms/combat.animateClauseParser (batch 14 `1daa5ef`; parseGrantedKeywords import dropped from parser.js). ✅ deal-damage
  scaled board-count → atoms/stack.dealDamageScaledClauseParser (batch 15 `0bac6f5`, program-diff=0 — DMG-SCALE branch only,
  printed "N damage" stays on legacyToAtom; parseCountSource imported into stack.js, stays in parser.js for FOR-EACH). All program-diff=0.
  ✅ rfg⇄reanimate co-extracted → atoms/zones.graveyardReturnClauseParser (batch 16 `6dc6022`). ✅ FP-hunt checkpoint #4 CLEAN
  (no-drift proof). ✅ gain-life⇄lose-life co-extracted → atoms/life.lifeClauseParser (batch 17 `fe9fb06`, program-diff=0 — scaled
  for-each + fixed-N clusters, one parser, original order; draw branches stay inline disjoint; parseCountSource into life.js). All program-diff=0.
  ✅ create-named-token → atoms/tokens.createNamedTokenClauseParser (batch 18 `6c4b25e`). ✅ token-helper leaf
  (batch 19 `946319f`, program-diff=0 — parseTokenManaAbility+parseTokenKeywords + their deps → parseHelpers leaf;
  parser.js dropped its keywords.js import). ✅ create-token (batch 20 `45c0206`). ✅ sacrifice EDICTS (batch 21 `b66e7e8`) + ✅ sacrifice self/triggering (batch 22 `d5d1d41`,
  program-diff=0 — folded into sacrificeEdictClauseParser; SACRIFICE-as-effect FULLY MIGRATED). All program-diff=0.
  ✅ draw each-player slice → atoms/misc.drawEachPlayerClauseParser + discard family → atoms/hand.discardClauseParser
  (batch 23 `b97b052`, program-diff=0 — co-extracted coupling; NUM_WORD import dropped from parser.js). All program-diff=0.
  ⏸️ destroy⇄exile DEFERRED (batch 24 attempt reverted, program-diff=52 — rider-folding-entangled, SAME class as A7 counter:
  `applyRemovalWithRider`/`applyControllerRider` strips "its controller …" before the bare anchor + re-attaches controllerRider;
  a post-parseExtendedAtom clause parser breaks it → 26 cards drop their rider. Needs the rider machinery moved WITH it — a dedicated batch).
  ✅ bounce family → atoms/zones.bounceClauseParser (batch 24 `d0f385b`). ✅ add-counter ±1/+1 → atoms/counters.addCounterClauseParser
  (batch 25 `e91d031`, program-diff=0 — 5 branches, clean now interleavers migrated). All program-diff=0.
  ✅ draw for-each/count-scaled → atoms/misc.drawForEachClauseParser (batch 26 `a0ec535`, program-diff=0 — clean now life siblings migrated;
  parseCountSource+NUM_WORD imports dropped from parser.js). All program-diff=0. Wave C clean ops EXHAUSTED.
  ✅ destroy⇄exile SHIPPED w/ rider-folding fix (batch 27 `22c8767`, program-diff=0 — matchRemovalControllerRider resolves its
  rider-stripped lead via `parseExtendedAtom() || destroyExileClauseParser`; the 26 controllerRider cards fold byte-identically;
  also dropped the orphaned `let m`). **RIDER-FOLDING PATTERN PROVEN.** All program-diff=0.
  ✅✅ **CLAUSE-PARSER SEAM MIGRATION COMPLETE (batch 29 census).** `fight` confirmed dispatch-level (parseClauseToAtom, not a
  parseExtendedAtom branch) → nothing left to extract. The GATE-TO-SCALING (GO-AFTER-SEAM) is OPEN.

  ## 🏁 SEAM MIGRATION — FINAL SUMMARY
  - **31 seam batches shipped, every one program-diff=0** (byte-identical canonical parseEffectClause output over all 34,160 cards — provably zero behavior change).
  - **parser.js: 2642 → 1673 lines (−969).** The ~149-branch `parseExtendedAtom` monolith is now a thin dispatcher over **33 co-located per-family clause parsers** in `atoms/*.js` (registered via `registerClauseParser`, resolved in `parseClauseToAtom`).
  - **Both rider-folding-entangled ops RESOLVED** (counter A7 + destroy⇄exile): the dispatch (`matchRemovalControllerRider`/`matchCounterControllerRider`/`matchCounterExileInstead`) resolves its rider-stripped lead via `parseExtendedAtom() || <clauseParser>`, so controllerRider/exileInstead fold byte-identically.
  - **FP-clean: 0 real false positives across 8 checkpoints** (#1 full sweep + #2–#8 no-drift proofs). The gate caught + reverted the 2 bare-lift entanglements (counter b12, destroy⇄exile b24) BEFORE they shipped; both re-shipped correctly. **0 bad commits ever reached master.**
  - **Residue inline (by design / different mechanism, NOT seam targets):** fused CDMG/dies-payoff templates (countContext), dispatch-level fight, Wave-D `{atom,rest}` standalone matchers (a separate infra seam if ever wanted), legacyToAtom fallback.

  **NEXT PHASE = COLTON'S CALL.** Card count stayed FLAT 20.8%/7,113 by design (the seam is a pure refactor). The next phase is NEW COVERAGE — moving the number — which is a strategy change off flat-by-design and Colton's to green-light. Options to put to him: (1) resume new-coverage card-adding (the builders fan back out onto the now-collision-free clause-parser modules); (2) prove ONE clean coverage wave end-to-end on the new seam first; (3) tackle the Wave-D standalone-matcher seam; (4) something else. **Loop STOPPED pending his decision.**

  ## 🟢 PHASE 2 DONE → PHASE 1 (DECK-TARGETED) — RECON FINDING (Colton chose plan 2→1→3, then "deck-targeted")
  - **Phase 2 PROVEN:** shipped MASS-DEBUFF (`83317e4`, +12 native, flip-diff 12 IN/0 OUT, all oracle-verified). The seam scales for new coverage. Built the **clause-frontier census** (corpus + `--decks`).
  - **Phase 1 deck-frontier finding (the important one):** the deck NO-ARBITER gap is **diffuse + ENGINE-HEAVY, not clean recognition.** 563 non-native deck cards, near-unique (top clause blocks 2). The clean-recognition trunk these decks had is ALREADY in their 44–74%. Probes confirm every remaining deck family needs ENGINE work:
    - **X-with-target/player** — `Draw X cards` is native (Mind Spring) but `Target player draws X cards` is Arbiter (Braingeyser/Stroke/Blue Sun's Zenith); and NO X-spell with a chosen target is native anywhere (Fireball/Banefire/Demonfire/Consume Spirit/Death Grasp/Disembowel all Arbiter). Needs the X-cast path to enumerate a chosen target + thread ctx.xValue. **Medium engine; UNLOCKS a big class** (X-burn + X-draw-to-target across many decks + corpus).
    - **Aristocrats creature-OR-planeswalker death scope** — the death-drain family is native (Blood Artist/Zulaport/Bastion/Falkenrath), but Cruel Celebrant (Vihaan) is body-only ONLY because of "or planeswalker" in the dies-scope (triggers.js:250 deliberately excludes it — modeling it as creature-only would DROP the PW-death case = a forbidden FP). Needs PW-death events + a creature-or-PW dies scope. Small-medium.
    - **Granted-ability statics** — "all Slivers have '[ability]'", "creatures you control have base P/T x/x" (Biomass Mutation), "permanents you control gain hexproof+indestructible" (Heroic Intervention). A static-layer ability-grant subsystem. **Biggest deck lever (Sliver Hivelord core + Koma anthems + corpus), biggest build.**
    - **Tribal/subtype evasion** ("Slivers can't be blocked except by Slivers", Serpent of Yawning Depths) — combatEvasion extension (polarity-careful). Small-medium. Sliver/Koma.
    - **Token-copy/doubling** (Adrix and Nev, Xorn, Second Harvest, Spark Double) — extend the Wave-3a doubler + clone. Medium. Koma/token decks.
  - **ESCALATED to Colton (step d):** clean-recognition deck waves are exhausted; deck NO-ARBITER requires committing to ONE engine family at a time, each a real sub-project with FP risk. Recommendation: **X-with-target first** (contained, broad high-value unlock) → then **granted-ability statics** (biggest deck-NO-ARBITER mover). Loop PAUSED pending his pick. master @ 3ecc492, 7125 native.
  the entangled ones first (add-counter interleaved w/ bounce/sac; counter A7 deferred). Co-extract couplings together
  (destroy⇄exile, rfg⇄reanimate, gain-life⇄lose-life, draw⇄discard-each-player). counter (A7) still deferred. Wave B = helper-leaf extractions (parseGrantedKeywords→pump; tutor helpers→tutor). Wave C = interleaved
  families (rad player-grant block / life / draw+discard / destroy⇄exile / add-counter / create-token(s) / animate /
  deal-damage / return-from-graveyard⇄reanimate / sacrifice). Wave D = standalone matchers (impulse-dig / discard-chosen
  / create-emblem) — different shape, deferred. **Couplings that MUST co-extract:** destroy⇄exile · rfg⇄reanimate ·
  gain-life⇄lose-life · draw⇄discard-each-player.

  ## 🟢 PHASE 1 RESUMED (Colton green-lit X-with-target → full self-direction 2026-06-27)
  - Colton: *"do option 1 [X-with-target] then make all future decision based on your own recommendation … do everything you can without me i trust you."* Loop un-paused; autonomous deck-grind running.
  - **WAVE: X-DRAW-TARGET (+3 native) — SHIPPED.** "Target player draws X cards" (Braingeyser, Stroke of Genius) + "Each player draws X cards" (Prosperity) now native.
    - **KEY FINDING that changed the plan:** the RECON called X-with-target a "medium engine build (needs X-cast path)". WRONG for the draw subset — the X-cast machinery (legalChoices enumerates X + threads `ctx.xValue`; `resolveScaledAmount` reads it; `applyDrawAtom` already loops `ctx.targets` for `who:target` / every player for `who:eachPlayer`) was **already complete**. The ONLY gaps were two parser bugs: (1) `rewriteAmountX`'s draw regex `(\bdraw\s+)X` didn't match "draw**s** X"; (2) the parser's amountX path **dropped `who`** (would've drawn for the controller = FP). 2-line recognition fix on the existing seam, no engine work. *(X-burn-to-target — Fireball/Banefire — is a separate slice; its damage path needs the chosen-target enumeration the draw path didn't.)*
    - **Gate (full CREED):** flip-diff **+3 IN / 0 OUT / 0 collateral** (baseline 6abdcfc). All 3 oracle-verified (bare forms, no rider). **2 new end-to-end resolution tests** in `xSpell.integration.test.js` prove the TARGET draws X (controller draws 0) + EACH player draws X via the real cast→pay→resolve pipeline. Adversarial surface: all **111** `draws X` cards enumerated — only the 3 bare forms flip; every rider form (Blue Sun's Zenith shuffle-back, Damnable Pact lose-X-life, Commander's Insight, all "where X is [board count]" computed-X) correctly stays Arbiter (FN-safe boundary = exactly the bare clause). **4224 tests green, lint clean.** Stale `misc.js` comment ("each/target X → Arbiter") corrected.
    - **Impact:** corpus 7125→**7128 (20.9%)**; aggregate decks **56% (835/1500, +1 — Zaxara 57→58%, Colton's X-spell deck).**
  - **WAVE: GROUP-KEYWORD-GRANT (+24 native) — SHIPPED (master @ next).** "(Creatures|Permanents) you control gain <kw[ and kw]> until end of turn." **Heroic Intervention** native — the deck target (Koma/Toph/Wolverine).
    - **Design:** new `grant-keywords-group` atom + `applyGrantKeywordsGroup` resolver (`atoms/combat.js`) + `groupGrantClauseParser` (registered in parser.js) + a `splitClauses` keep-whole guard (so "hexproof **and** indestructible" isn't shattered on the internal " and "). Resolver = a layer-6 endOfTurn `addKeyword` over a FIXED snapshot of the controller's permanents (CR 611.2c). `creaturesYouControl` → your creatures (membership at resolution); `permanentsYouControl` → ALL your permanents (indestructible protects lands/artifacts — Heroic). **Reuses 3 existing systems** (keyword vocab, `addContinuousEffect`, layer-aware enforcement: canBeTargetedBy / isIndestructible / combatEvasion) — register-onto-existing, NOT a new subsystem.
    - **Keystone decision — hexproof/shroud grantability:** they were excluded from the shared `GRANTABLE_STATIC_KEYWORDS` by conservatism, but their enforcement is COMPLETE + layer-aware (`canBeTargetedBy` honors a granted instance; targeting-exclusion is the ENTIRETY of what they do → no partial behavior). Admitted them on a LOCAL set (`GROUP_GRANTABLE_KEYWORDS`) used by this one-shot path ONLY → the anthem path (`staticAbilityParser`) is byte-identical, **zero blast radius** (flip-diff 0-OTHER confirms no static-anthem card moved).
    - **Gate (full CREED):** flip-diff **+24 IN / 0 OUT / 0 collateral** (baseline a6b9696). All 24 oracle-verified: 13 spells (bare + Crash Through/Warlord's Fury draw-rider + Duty Beyond Death counter-rider + Grand Crescendo X-token), 4 modal (Boros/Simic/Family Reunion/Deafening Clarion — every mode modeled), 7 activated, 4 triggers. Duty Beyond Death's "As an additional cost … sacrifice a creature" = a handled cast-path pattern (`ADDITIONAL_COST_RE`, 36 native precedents incl. Diabolic Intent). **13 resolver tests** (`groupKeywordGrant.test.js`): permanents/creatures scope, layer-aware hexproof/indestructible/shroud enforcement, CR 611.2c snapshot-lock (latecomer excluded), EOT expiry, empty-board no-op. Adversarial: the 63-card instant/sorcery group-grant family enumerated — only bare/modal/activated/trigger flip; riders (Yuan-Ti Scaleshield "Seek …"), Addendum (Unbreakable Formation), color-choice (Akroma's Blessing/Brave the Elements), filters (white/green/Warrior creatures), and the static "have" anthem all stay Arbiter (FN-safe boundary = the bare whole-clause). **4238 green (+15: 13 groupKeywordGrant + 1 teamPump native assertion + parser.test boundary swap), lint clean.** Updated 2 stale boundary tests (parser.test MUST_DROP_TO_LOW + teamPump.test) — the bare team grant moved from deferred→native, swapped in an un-grantable variant to keep the low-guard meaningful.
    - **Impact:** corpus 7128→**7152 (+24, 20.9%)**; aggregate decks **56% (838/1500, +3 — Koma 69→70%, Toph 56→57%, Wolverine 44→45%).**
  - **WAVE: STATIC-HEXPROOF-SHROUD (+14 native) — SHIPPED.** Admitted **hexproof + shroud** to `GRANTABLE_STATIC_KEYWORDS` → the anthem / equipment / token-maker paths can grant them. **Crystalline Sliver** (Sliver Hivelord) + **Lightning Greaves** (near-universal staple) now native.
    - **The decision:** hexproof/shroud were excluded from the static grant set by conservatism, but their enforcement is COMPLETE + layer-aware (canBeTargetedBy reads permanentHasKeyword over continuousEffects → a granted instance is honored; targeting-exclusion is the ENTIRETY of what they do, so no partial behavior / no FP). A 1-line set change reusing the whole static-grant subsystem (anthems, equipment/aura, minted tokens). Folded GROUP-KEYWORD-GRANT's local hexproof/shroud set into the shared set (the local-scoping rationale is now obsolete).
    - **Gate (full CREED):** flip-diff **+14 IN / 0 OUT / 0 collateral** (baseline f32fe79). All 14 oracle-verified: 10 anthems (Crystalline Sliver shroud, Hanna's Custody, Privileged Position [hexproof errata in bundled data], Asceticism, Drogskol Captain, Lord of the Unreal, Scion of Oona, Devil Dinosaur, Sterling Grove + the 1 conditional **Angelic Overseer**), 2 equipment (Lightning Greaves, Mask of Avacyn), 2 token-makers (Deeproot Waters, Jungleborn Pioneer — hexproof Merfolk). **CREED-critical: Angelic Overseer's "as long as you control a Human" gate is HONORED** — runtime-probed false/false without a Human, true/true with one (the GATED-KEYWORD mechanism, `e.op.gate`/`gateMet`). **8 tests** (`staticHexproofShroud.test.js`): anthem enforcement (opponent can't target your hexproof creature, you can; all-Slivers shroud untargetable by anyone), the conditional gate, equipment/token flips, CREED non-flips (quoted-ability Crypt Sliver + un-enforced shadow stay Arbiter). **4246 green, lint clean.** Updated 4 boundary tests (gatedArtifact ×2, equipBonusProtection, groupGrant, counterPayoffKeyword) that pinned hexproof/shroud as non-grantable → swapped to `shadow` (still un-enforced) so the guards stay meaningful; Crystalline Sliver assertion updated body-only→native-static.
    - **Impact:** corpus 7152→**7166 (+14, 21% — crossed the 21% line)**; aggregate decks **56% (841/1500, +3 — Sliver Hivelord 74→75%, Omnath 61→62%, +1).**
  - **FRONTIER STATUS (self-directed continuation rationale):** the deck-ONLY frontier is now thinning to escalate-tier or single-card-engine. Remaining deck gaps: **(a)** Sliver QUOTED-ABILITY granted statics ("All Slivers have '<activated/triggered ability>'" — ~50 corpus cards, ~10 in Sliver Hivelord) = the granted-ability static subsystem (ESCALATE-tier, big); **(b)** Cruel Celebrant = Zulaport + "or planeswalker" dies-scope — needs PW-death detection + a creature-or-PW scope (engine, single-card); **(c)** Mirkwood Bats = "create or sacrifice a token" trigger (new event); **(d)** Marionette Apprentice = "put into a graveyard from the battlefield" + fabricate. Corpus reuse waves (like this one) still available. **Per Colton's "do everything you can without me," NOT escalating yet** — escalation is for a genuine fork (commit to a big subsystem), not a thinned deck-only frontier; keep shipping CREED-safe corpus waves that reuse existing families.
  - **WAVE: PUMP-STATIC-GRANT (+45 native) — SHIPPED.** The shared keyword-grant gate `parseGrantedKeywords` (pump / self / team / triggering-creature + activated-ability + animate) now uses `GRANTABLE_STATIC_KEYWORDS` → grants indestructible / hexproof / shroud, not just combat keywords. **1-line change** (the gate set), reusing applyPumpEffect's layer-6 addKeyword + the validated enforcement. This completes the keyword-grant family for these 3 keywords across ALL paths (one-shot group [GROUP-KEYWORD-GRANT], static anthem [STATIC-HEXPROOF-SHROUD], single-target/activated/triggered [this wave]).
    - **Reverses the old "combat tricks stay combat-only" divergence** (keywords.js) — its "until-EOT grant not modeled yet" rationale is obsolete (modeled in GROUP-KEYWORD-GRANT, enforcement validated in STATIC-HEXPROOF-SHROUD).
    - **Gate (full CREED):** flip-diff **+45 IN / 0 OUT / 0 collateral** (baseline 27cadf0). ALL 45 oracle-verified: 24 single-target/team/modal protection spells (Blossoming Defense / Dive Down / Ranger's Guile / Glint / Chase Inspiration / Beaming Defiance / Woodcutter's Grit = +N/+N&hexproof; Adamant Will / Mortal's Resolve / Unlikely Aid / Masterful Flourish / Survive the Night [+investigate] / Sheltering Light [+scry] / Withstand Death / Without Weakness [+cycling] = indestructible; Alesha's Legacy / Battle-Rage Blessing / Horrid Vigor / Offer Immortality / Rush of Vitality = deathtouch&indestructible; Overprotect = trample,hexproof,indestructible; Mage's Guile = shroud; Make a Stand = team; Professor's Warning = modal), 13 activated (Sylvan Safekeeper / Deathless Angel / Thornling / Wily Bandar / Amaranthine Wall / Grappling Sundew / Resolute Rider & Watchdog / Pitiless Pontiff / Giant Crab / Glimmering Angel / Advanced Hoverguard / Horror of the Dim), 5 triggers (Angelheart Protector / Rage-Scarred Berserker / Plumecreed Escort ETB, Cathar's Companion cast, Dreadwurm landfall), 3 mixed (Manhole Cover / Nahiri's Machinations / Reaper of the Wilds). **No conditional gates in the set** → no gate-drop FP risk; every rider modeled (scry/investigate/cycling/modal) or reminder text (the "0 toughness still dies" line = isIndestructible's CR 704.5f call-site carve-out, matching the cards' own reminder). **5 resolver tests** (`pumpStaticGrant.test.js`): granted indestructible→isIndestructible, hexproof→opponent-can't-target/controller-can, shroud→untargetable-by-anyone. **4254 green, lint clean.** Updated **15 boundary tests across 8 files** (parser.test ×6, actKeywordGrant, combatTrick ×2, overrunScale, teamPump, trigPronounIt, trigPump, animate) that pinned the static keywords as non-grantable → swapped to `shadow`/`banding` (still un-enforced) so the ALL-OR-NOTHING guards stay meaningful.
    - **Impact:** corpus 7166→**7211 (+45, 21.1%)**; aggregate decks flat (841/1500 — these 45 are corpus protection spells, none in the 13 decks). The keyword-grant family is now drained for indestructible/hexproof/shroud.
  - **WAVE: SELF-DAMAGE-BY-POWER (+8 native) — SHIPPED.** "Target creature deals damage to itself equal to its power" (Justice Strike / Repentance / Wrack with Madness / Inner Struggle / Kiku's Shadow) + activated (Kiku, Night's Flower) + MASS "Each creature …" (Solar Blaze, Wave of Reckoning). New `damage-self-power` atom + `applyDamageSelfPower` resolver — a "self-fight" mirroring fightCreature: lock layer-aware power, mark as damage on self, single lethal-SBA + dies-triggers. REAL damage (indestructible survives, deathtouch lethal, regen/prevention apply). Reuses markCombatDamage + destroyLethalCreatures + checkDiesTriggers + creaturePower (parser branches in combatKeywordClauseParser, already registered).
    - **Gate (full CREED):** flip-diff **+8 IN / 0 OUT / 0 collateral** (baseline 383f0be). All 8 oracle-verified; full surface enumerated (rider form Cut Propulsion + Saga Akroan War correctly stay Arbiter, FN-safe). **9 resolver tests** (`damageSelfPower.test.js`): death iff power≥toughness, indestructible survives, deathtouch lethal, 0-power no-op, MASS simultaneity. **4263 green, lint clean** (no boundary breaks). Corpus 7211→**7219 (+8, 21.1%)**; decks flat (none in the 13).
  - **WAVE: FLYING-RESTRICTION (+35 native) — SHIPPED.** The anti-flyer removal archetype: "destroy / deal N damage to target creature WITH flying" (Plummet, Pierce the Sky, Shredding Winds) + "WITHOUT flying" (Roast, Defenestrate). `parseCreatureTargetRestrictions` (spellEffects.js) now extracts `{kind:"hasKeyword", keyword:"flying", negate}` + `MODELED_RESTRICTION_RES` strips "with/without flying" (so the cleanedOracle passes isCleanClause, which otherwise rejects "with flying" via UNMODELED_MARKERS — the reason these were Arbiter). Enforcement = the EXISTING `creatureSatisfiesRestrictions` hasKeyword check (layer-aware); enumerateTargets only offers legal creatures. **2-spot recognition change, zero new resolver.**
    - **Gate (full CREED):** flip-diff **+35 IN / 0 OUT / 0 collateral** (baseline 2d393ad). ALL 35 oracle-verified: deal-damage/destroy-flyer spells + modeled riders (gain-life / Food token / cycling / can't-be-countered / can't-be-regenerated), all-modes-modeled modals (Branching Bolt with+without, Crushing Canopy/Vines, Thunderbolt, Sarkhan's Resolve, Pawpatch/Unforgiving Aim 3-mode, Reckless Air Strike, Shredded Sails, Tangletrap), combat+flying combos (Femeref Archers attacking-flyer, Skyshooter attacking-or-blocking, Pit Trap attacking-without-flying), activated (Centaur Archer, Grapeshot Catapult, Elvish Skysweeper, Predator Flagship, Viridian Scout, Skyway Sniper), optional triggers (Stingerfling Spider, Geistcatcher's Rig, Lys Alana Bowmaster, Deadshot Minotaur), Adventure (Web Shot). **7 resolver tests** (`flyingRestriction.test.js`): enumerateTargets offers ONLY flyers for "with", ONLY non-flyers for "without"; an unmodeled keyword restriction (first strike/shadow) stays Arbiter. **4270 green, lint clean.** Updated 2 boundary pins (parser.test MUST_DROP + spellEffects.test) that used "with flying" as the unmodeled example → "with first strike".
    - **Impact:** corpus 7219→**7254 (+35, 21.2%)**; decks flat (anti-flyer removal, none in the 13).
  - **WAVE: LIFE-GAIN-TARGET (+7 native) — SHIPPED.** "Target player gains N life" (Soothing Balm, Heroes' Reunion, Natural Spring, Healing Hands [+draw], Sylvan Bounty [+landcycling]) + activated (Mournful Zombie, Orzhov Guildmage). Extended `applyGainLife` with a who:"target" branch (mirrors applyLoseLife — chosen player gains + fires THAT player's lifegain triggers, controller untouched) + a `lifeClauseParser` branch. Reuses gainLife + checkLifegainTriggers.
    - **Gate (full CREED):** flip-diff **+7 IN / 0 OUT / 0 collateral** (baseline 3fcbf09). All 7 oracle-verified (riders modeled: draw / landcycling / Orzhov's 2nd ability). No triggers flipped → no atomTargetIntent needed. **4 resolver tests** (`lifeGainTarget.test.js`): target gains N (controller unchanged), self-target. **4274 green, lint clean.** Corpus 7254→**7261 (+7, 21.3%)**; decks flat.
  - **WAVE: TOUGHNESS-RESTRICTION (+6 native) — SHIPPED.** "destroy target creature with toughness N or greater|less" (Collar the Culprit, Sungold Barrage, Gallant Strike [+cycling], modal Destroy Evil/Valorous Stance, ETB Fleshpulper Giant). Mirrors the power restriction: `parseCreatureTargetRestrictions` extracts `{kind:"toughness", op, value}` + `MODELED_RESTRICTION_RES` strips it. Enforcement ALREADY existed (creatureSatisfiesRestrictions kind:"toughness" from TAP-TARGET-CREATURE) → pure recognition, zero resolver. (Gate caught a duplicate enforcement branch I'd added — removed it; toughness was already enforced.)
    - **Gate (full CREED):** flip-diff **+6 IN / 0 OUT / 0 collateral** (baseline 35acada). All 6 oracle-verified — modal modes modeled (Valorous Stance's indestructible mode rides PUMP-STATIC-GRANT), Fleshpulper Giant proves the "or less" + optional "you may". **5 resolver tests** (`toughnessRestriction.test.js`): enumerateTargets offers ONLY toughness≥4 / ≤2 respectively. **4279 green, lint clean.** Corpus 7261→**7267 (+6, 21.3%)**; decks flat.
  - **WAVE: MASS-FILTERED-DAMAGE (+22 native) — SHIPPED.** "deals N damage to each creature with|without flying" (Gale Force/Needle Storm/Squall; Seismic Shudder/Tremor; X-forms Corrosive Gale/Windstorm) + activated/triggers/modal/riders. New `massFilteredDamageClauseParser` (stack.js, bypasses isCleanClause) → `{op:deal-damage, targetType:eachCreature, restrictions:[{kind:hasKeyword,keyword:flying,negate}]}`; `applyDamageEffect`'s eachCreature branch filters via `creatureSatisfiesRestrictions` (restrictions threaded through the deal-damage resolver call). Reuses the eachCreature deal-damage path + hasKeyword enforcement — keeps targetType:eachCreature so all mass threading (NON_CHOSEN, MASS, metric, X-amountX) is intact.
    - **Gate (full CREED):** flip-diff **+22 IN / 0 OUT / 0 collateral** (baseline 6192800). All 22 oracle-verified — X-forms (amountX path preserves restrictions), modal (Hurly-Burly both modes, Take Down target-flyer+each-flyer), riders (Shake the Foundations +draw, Rough//Tumble split), and the source-self case CORRECT (Thunder Dragon/Ryusei have flying → "without flying" spares them). **5 resolver tests** (`massFilteredDamage.test.js`): with→every flyer both sides / non-flyers spared; without→non-flyers / flyers (incl. flying source) spared. **4284 green, lint clean.** 1 boundary pin (parser.test MUST_DROP) swapped to "with first strike" (still-unmodeled mass filter). Corpus 7267→**7289 (+22, 21.3%)**; decks flat.
  - **WAVE: COMBAT-TEAM-PUMP (+10 native) — SHIPPED.** "attacking|blocking creatures get +N/+N until end of turn" (Trumpet Blast/Army of Allah/Morale; Hold the Line/Piety/Rally; Hydrolash -2/-0 attacker debuff +draw; Iroh/Pianna attack-triggers). New atomTargets scopes `attackingCreatures`/`blockingCreatures` (filter massCreatureTargets by state.combat.attackers/blockers — the same source creatureSatisfiesRestrictions reads) + a pumpClauseParser branch. Reuses applyPumpEffect entirely (set locked at resolution, CR 611.2c).
    - **Gate (full CREED):** flip-diff **+10 IN / 0 OUT / 0 collateral** (baseline ebccf61). All 10 oracle-verified — negative ptDelta (Hydrolash) + draw modeled, attack-triggers include the attacker itself correctly, cycling stripped. **5 resolver tests** (`combatTeamPump.test.js`): attacking pump hits attacker only (not bench/blocker); blocking pump hits blocker only. **4289 green, lint clean.** 2 boundary pins (parser.test, teamPump.test) swapped to the you-control-filtered attacking subset (still unmodeled). Corpus 7289→**7299 (+10, 21.4%)**; decks flat.
  - **Next (self-directed):** mine `clause-frontier --spell/--perm`. Corpus is long-tail (restriction families + mass-flying-damage + combat-team-pump all done). Escalate at a genuine subsystem fork (granted-ability quoted statics, PW-death scope, becomes-blocked/new-trigger-event, must-attack, multi-target enumeration) or 2 consecutive engine-only fires. **NOTE: 11 clean waves this run (+186 native, 0 FPs) → v0.47.0 release warranted; flagged to Colton (don't auto-tag).**

## Transition safety (do NOT create a throughput gap)
- Builder faculty chats **keep running** until Phase 2 proves one clean wave. The old build never stops before
  the new one works.
- Other **integrator** sessions stood down NOW (sole master-write — two writers is the race we're killing).
- **Before archiving any builder:** checkpoint-push its worktree to origin — unpushed work orphans in an
  isolated worktree invisible to `git fetch` / `gh pr list` / `STATUS.md`.

## Open (Colton)
- **Spend ceiling** (a number per day/week) — informs batch size + fan-out width.
- Seam **family-boundary spec** assumed mine to decide (mirror `atoms/*.js`), documented at Phase 1 — flag if not.

## Pertinent memories
`project_creed_and_discipline` · `project_coverage_metric_decoupled_from_runtime` · `feedback_build_systems_register_cards`
· `project_parallel_coverage_orchestration` · `project_no_arbiter_for_training_decks` · `project_clyde_facilitator_identity`.
