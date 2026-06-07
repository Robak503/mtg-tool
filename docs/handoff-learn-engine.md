# Handoff prompt — MTG Tool, The Academy (Phase-2 engine rebuild)

Paste the block below into a new chat to continue the work. It's written to be
self-contained, but the new session should still read `CLAUDE.md` and the design
docs it points to before touching code.

**Last refreshed:** 2026-06-06 · after v0.28.0 (P2.1–P2.4 shipped) · master green
at ~1558 vitest · lint 0 warnings.

---

```
ultracode

You are Claude Code continuing the "Phase 7" maximal-fidelity engine rebuild on
MTG Tool — a local-first, Tauri-packaged Windows .exe Magic: The Gathering
Commander assistant. Read CLAUDE.md FIRST (operating manual; it overrides
defaults). Owner is Colton (vibe-coder; he directs, you build; you have full
architectural authority and STANDING permission to commit/push/PR/merge and cut
releases without per-step approval until he stops you or you run out of tokens).
Repo: https://github.com/Robak503/mtg-tool. Be exhaustive and adversarially
verify your own work before shipping.

## Where things stand (read these to confirm, don't trust this blindly)

Phase 1 (Foundation) is DONE: serializable {resolver,params} stack, triggers,
CR 613 layers. Phase 2 (Depth) is IN PROGRESS — P2.1–P2.4 are SHIPPED + released
+ auto-updating:
- v0.26.0 — P2.1 unresolved→Arbiter seam. A cast spell the engine can't model
  flags `state.pendingArbiter` + logs `spell-unresolved` (NEVER a silent no-op);
  the driver surfaces `decision.kind:"unresolved"`; the UI (LearnView
  UnresolvedPanel) fetches an Ollama-only Arbiter ruling; `/api/learn/continue`
  resumes. Save schema v2→v3.
- v0.27.0 — P2.2 EffectProgram interpreter (`app/src/lib/learn/effects/`:
  parser.js / effectAtoms.js / runProgram.js) under the `effect-program` resolver
  key; ALL-OR-NOTHING confidence gate (high runs every atom, low runs ZERO →
  Arbiter seam). P2.3 pump wiring (Giant Growth via the layer engine; "-X/-X"
  runs the lethal SBA).
- v0.28.0 — P2.4 target restrictions (`spellEffects.parseCreatureTargetRestrictions`
  — an ALLOWLIST residue check modeling controller/tapped/power; `enumerateTargets`
  filters; restricted removal resolves native + only surfaces legal targets).

Master is green (~1558 vitest cases) and lint-clean. The learn engine is pure +
immutable (every helper returns new state). Authoritative roadmap:
`docs/phase7-engine-rebuild.md` §4 (the P2.1..P2.13 spine). Blueprints:
`docs/design/engine-rebuild/04-effect-interpreter.md`. Memory files
`project_phase2_coverage_path.md` + `project_phase7_engine_rebuild.md` have the
full history + lessons.

## Your mission, in order

### STEP 1 — A live QA pass on the shipped Phase-2 Academy (do this FIRST)
The four shipped slices have ~1558 unit tests but the BROWSER/UX path and the
Ollama Arbiter handoff have never been live-dogfooded. Run a real QA pass:
- `cd app && npm run dev` (serves at http://localhost:3000). Open The Academy
  (Garfield / Learn-to-Play). Use the gstack `/qa http://localhost:3000` skill OR
  the preview_* tools to drive it.
- Exercise and verify with PROOF (screenshots / console / network), not claims:
  1. Start a Beginner 1v1 game; play several turns. No console errors, no
     engine-stuck.
  2. Cast a spell the engine can't model → confirm the UnresolvedPanel appears,
     calls /api/arbiter (Ollama — if Ollama isn't running, confirm the graceful
     "Arbiter offline, continue anyway" fallback), and "Continue playing" resumes.
  3. Confirm restricted removal only offers legal targets; pump visibly buffs a
     creature and wears off; the action feed shows `spell-unresolved` for
     opponent/Expert unmodeled spells.
  4. Save mid-game, restart the dev server, Resume — confirm it re-hydrates (and
     re-surfaces an unresolved pause if one was active).
- File + FIX any UX/integration bug you find (the unit tests can't see these).
  If Ollama isn't available in the environment, note exactly what you could and
  couldn't verify — don't claim what you didn't see.

### STEP 2 — Build P2.5: multi-clause + modal + X-spells (the keystone generalization)
This is the big one (L/med). The parser stops being a thin wrapper over the
single-effect legacy matcher and becomes a real MULTI-ATOM parser:
- Clause splitter: split the oracle on ". " / ";" / top-level " and " and
  re-parse EACH clause to an atom — REVERSING P2.2's conjunction guard by
  SPLITTING instead of denying. All clauses parse to known atoms → HIGH
  multi-atom program; any clause unparseable → LOW (all-or-nothing holds). NOTE:
  riders like Lightning Helix's "and you gain 3 life" only fully light up once
  P2.7 adds the `gain-life` atom — until then that clause is unparseable → the
  whole spell stays LOW (safe; intended incremental order).
- Per-atom `atomIndex` targeting (the invasive part): generalize the single
  `action.targets:[t]` into per-clause target binding so clause 1 can target a
  creature and clause 2 a player. `legalChoices.actionsCastSpell` grows an
  `expandCastChoices`. See 04-effect-interpreter.md §2.5 (ChoiceBindings).
- Modal "choose one —": parse modes (each a sub-program), surface one cast action
  per (mode × target).
- X-spells: read `legalChoices.parseManaCost(...).hasX`, bind X at cast, thread it
  into the atom amount.

Then P2.6 (token + counter atoms — `createTokenPermanent` + `addCounter`) and P2.7
(atom-family: gain-life/lose-life/tap/untap/bounce/discard/mill/scry/exile on
existing gameState helpers) as runway allows. Full detail: roadmap §4 +
04-effect-interpreter.md.

### STEP 3 — Re-QA after P2.5 lands (a user-visible milestone), then ship the bundle.

## Binding decisions (do NOT relitigate)
- Coverage = % of a real game resolved natively; the Arbiter (/api/arbiter,
  Ollama-only) absorbs the tail FOREVER — a handoff is a feature, never a gap.
- Confidence is ALL-OR-NOTHING (high runs every atom; low runs zero + emits
  pendingArbiter). The ENGINE never makes a network call; the UI invokes the
  Arbiter. Never fabricate an effect; a miss is safe, a false grant is forbidden
  (CLAUDE.md §1.2). `effect-program` is the reserved interpreter key — additive,
  never overloads `spell.effect`.
- Cycle discipline: layers.js / ptPrimitive.js / staticAbilityParser.js NEVER
  import gameState. effects/ modules build on spellEffects (which imports only
  gameState+triggers); resolvers.js → runProgram.js (so runProgram must NOT import
  resolvers — it uses the leaf pendingArbiter.js). card.type vs card.type_line:
  read BOTH. Never shadow keywords.hasKeyword. Server file access via paths.js.

## Hard-won lessons from P2.1–P2.4 (the adversarial reviews earned their keep —
run one before EVERY engine ship, it caught real bugs every time):
- ALLOWLIST > DENYLIST for the confidence gate. P2.4's review found ZERO issues
  because its residue check rates HIGH only when the match SPANS the whole clause;
  P2.2/P2.3 denylists (deny known-bad markers) leaked 3 critical false-highs
  (in-sentence "and" riders, "attacking/tapped" restrictions, negative-pump). For
  P2.5's clause splitter, verify each split clause is FULLY accounted for; never
  rely on a marker denylist alone.
- Any atom that lowers toughness or creates a creature must run/respect the lethal
  SBA (destroyLethalCreatures + checkDiesTriggers) — the P2.3 negative-pump bug.
- Every newly-HIGH oracle shape gets PINNED in the `MUST_DROP_TO_LOW` /
  must-resolve corpus in `effects/parser.test.js` (the CI merge gate) BEFORE
  merge — the gate is only as strong as its examples.
- CONTRACT-MIG: any PR changing persisted game-state shape ships a
  `learnSaveSchema` MIGRATIONS[N] + a save-v<N> fixture in the SAME PR. The
  index's `resumable` flag must be computed against the MIGRATED doc
  (learnSaveStore.indexEntryFromDoc) or a schema bump strands every in-flight save.

## Process + landmines
- Verify EVERY push with BOTH `cd app && npm run lint` AND `npm test`. CI's test
  job runs `eslint . --max-warnings 0` and fails on ANY warning; `npm test` does
  NOT lint. Before merging confirm `gh pr checks <n>` literally says `pass` (the
  --watch exit code lied once). The bash tool's cwd resets between turns — `cd app`
  each time or it errors with package.json ENOENT.
- Stage EXPLICIT paths, not `git add -A` — an untracked stray doc keeps trying to
  ride along; check `git status` before committing.
- Ship cadence: feature branch → PR to master → CI green → merge → bump
  app/package.json AND app/src-tauri/tauri.conf.json + CHANGELOG → tag vX.Y.Z (-a)
  → release CI (~18 min, signed installer + latest.json) → auto-update. Current
  version is 0.28.0; next user-visible bundle is v0.29.0. Cargo.toml stays at
  0.3.0 (decoupled). Conventional Commits; end commits with
  "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>".
- Adversarial review = a Workflow: review across dimensions → independently verify
  each finding (default isReal=false) → fix only the real ones. The reviewers
  scan the real bundled Scryfall corpus (app/data/scryfall-bulk/oracle_cards.json)
  for false-highs — that's how the criticals were caught. Pin every confirmed
  finding in the corpus.

## Start here
1. Read CLAUDE.md + docs/phase7-engine-rebuild.md §4 + 04-effect-interpreter.md +
   the two memory files.
2. From clean master: `cd app && npm test` (~1558 green) and `npm run lint`
   (clean) — confirm the baseline.
3. Do STEP 1 (the live QA pass). Then build P2.5 (STEP 2) with the ultracode
   process: small TDD sub-PRs, lint+test after each, an adversarial review of the
   diff, the MUST_DROP_TO_LOW corpus updated, batched into one PR, re-QA, ship at
   the milestone.
```
