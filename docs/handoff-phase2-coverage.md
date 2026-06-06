# Handoff prompt — MTG Tool, Phase 2 (Depth): the coverage spine

Paste the block below into a new chat to continue the work. It's written to be
self-contained, but the new session should still read `CLAUDE.md` and the docs it
points to before touching code.

---

```
ultracode

You are Claude Code continuing work on MTG Tool — a local-first, Tauri-packaged
Windows .exe Magic: The Gathering Commander assistant. Read CLAUDE.md FIRST (it's
the operating manual and overrides defaults). Owner is Colton (vibe-coder; he
directs, you build; you have full architectural authority and standing permission
to commit/push/PR/merge and cut releases without per-step approval until he stops
you or you run out of tokens). Repo: https://github.com/Robak503/mtg-tool. Be
exhaustive and adversarially verify your own work before shipping.

## Where things stand

Phase 1 (Foundation) of the "Phase 7" maximal-fidelity engine rebuild is COMPLETE
and released. The learn/playtest engine lives in app/src/lib/learn/ and is pure +
immutable (every helper returns new state). Shipped + auto-updating:
- v0.23.0 — serializable {resolver,params} stack + deterministic ids + mid-game
  save/resume.
- v0.24.0 — triggered abilities (ETB / dies / upkeep-draw-end / attack), APNAP,
  Arbiter as the fail-safe for anything unparseable.
- v0.25.0 — CR 613 continuous-effects/layers engine: anthems, tribal lords
  (Slivers), color anthems, granted keywords (flying/deathtouch/haste/etc. now
  count in combat + legality), until-end-of-turn pump MECHANISM, cleanup expiry,
  and the AI reads derived (buffed) P/T. `creaturePower`/`creatureToughness`
  delegate to layers.js; `staticPTModifier` is gone.

Master is green (~1467 vitest cases) and lint-clean.

## Your mission: Phase 2 (Depth) — grow engine COVERAGE on the Phase-1 infra

The locked goal (do NOT relitigate): NOT Forge/XMage template parity (an unbounded
tail). The goal is "every common interaction in a NORMAL Commander game, plus a
verified Arbiter ruling for the rest," measured by a SUPPORTED-vs-ARBITER-RESOLVED
coverage metric that climbs over time. The Arbiter (/api/arbiter, Ollama-only) is a
PERMANENT, load-bearing fail-safe — handing an unparseable effect to it is a
feature, never a gap to eliminate. The parser must be "incomplete but never wrong":
anything it isn't confident about routes to the Arbiter with full context, NEVER a
silent no-op and NEVER a fabricated effect (CLAUDE.md §1.2 — a miss is safe; a false
grant is forbidden).

Build the Phase-2 spine as small TDD sub-PRs (suite green after each), batch a
coherent slice into ONE GitHub PR when it's a working feature, adversarially review
the diff before shipping, and cut a release at a user-visible milestone.

## Read these first (locked design + binding decisions)

- CLAUDE.md (operating manual; §1 prime directives; §5 gotchas; §6 agent specs —
  Arbiter is Ollama-only).
- docs/phase7-engine-rebuild.md §4 — THE ordered Phase-2 coverage spine (the table
  of P2.1..P2.13 with coverage/effort/risk/dependsOn), the Arbiter boundary, and
  the biggest risk. This is authoritative.
- docs/design/engine-rebuild/04-effect-interpreter.md — the EffectProgram / Atom /
  target-spec / confidence-boundary blueprint (the keystone design).
- docs/design/engine-rebuild/06-test-and-realism.md — the coverage-metric definition
  + scope-realism (why coverage %, not parity, is the measure).
- docs/design/engine-rebuild/00-critique-reconciliation.md — the canonical
  cross-section contracts (these win over any single blueprint).
- Memory files project_phase2_coverage_path.md (the spine summary + decision) and
  project_phase7_engine_rebuild.md (Phase-1 history + contracts).

## The binding decisions for this phase (do NOT relitigate)

- Coverage = % of a real game resolved natively; Arbiter absorbs the tail forever.
  Progress is the climbing supported-vs-Arbiter number, not cards-scripted.
- Stack/trigger payload is `{resolver, params}` (frozen in resolvers.js). The
  effect interpreter gets the RESERVED `effect-program` resolver key (already in
  RESOLVER_KEYS) — it is ADDITIVE and never overloads `spell.effect`.
- Confidence is ALL-OR-NOTHING: a high-confidence parse runs EVERY atom; a
  low-confidence parse runs ZERO atoms and emits an `unresolved`/`pendingArbiter`
  decision. No partial execution, ever.
- The ENGINE never makes a network call. The Arbiter is invoked from the UI
  (LearnView), Ollama-only, with full board context.
- The pump MECHANISM already exists and is tested: layers.addContinuousEffect +
  layers.expireContinuousEffects (wired into gameEngine cleanup, CR 514.2). P2.3
  WIRES a pump spell to it — do NOT rebuild the mechanism.
- Cycle discipline: layers.js / ptPrimitive.js / staticAbilityParser.js NEVER
  import gameState (gameState delegates OUTWARD to layers). New modules stay leaves
  of gameState where possible. triggers.js / resolvers.js are leaves too.
- card.type vs card.type_line: ALWAYS read both. NEVER shadow keywords.hasKeyword
  (import it). All server file access via paths.js helpers.

## The spine (full detail in roadmap §4) — build in this order

P2.1 ▶ START — Unresolved→Arbiter seam (S/low, huge): learnSession returns an
  `unresolved` decision kind (`pendingArbiter`) carrying the card + board context
  instead of a silent no-op; /api/learn/start + /api/learn/step surface it;
  LearnView renders it and calls /api/arbiter (Ollama-only) with the board, then
  lets the player continue. The fail-safe everything downstream routes through.
  (Check whether a `pendingArbiter`/`unresolved` seam was already stubbed in
  learnSession per the Phase-1 R7 note before building.)
P2.2 — EffectProgram interpreter keystone (M/med): a new module defining
  EffectProgram = ordered Atom[] + programConfidence, and runEffectProgram(state,
  program, context) executing atoms in order (all-or-nothing on low confidence),
  registered under the `effect-program` key. spellEffects.parseSpellEffect becomes
  a facade that emits an EffectProgram; applyCastSpell emits
  payload:{resolver:"effect-program", params:{program,...}}. Re-express today's
  supported effects (deal-damage/destroy/draw/gain-life/lose-life) as atoms FIRST
  to prove parity, then grow.
P2.3 — Pump-spell wiring (S/low, high): a `pump` atom that calls
  layers.addContinuousEffect({layer:7, sublayer:"7c", op:{layerOp:"ptModify",
  power, toughness}, affects:{mode:"fixed", permanentIds:[targetId]},
  duration:{kind:"endOfTurn", turn:state.turn}, source:{kind:"resolution",...}}).
  Giant Growth +3/+3 wears off at cleanup. Integration test through learnSession.
P2.4 — Targeting restrictions + AI awareness (controller/keyword/type/power/tapped;
  enumerateTargets filters; chooseAITarget honors them — removal stops hitting own
  creatures).
P2.5 — Multi-clause + modal ("choose one") + X-spells (clause→atoms; X from hasX;
  all-or-nothing on low).
P2.6 — Token + counter atoms (create-token via a createTokenPermanent; put-counters
  via addCounter).
P2.7 — Atom-family expansion (life/tap/untap/bounce/discard/mill/scry/exile).
P2.8 — Coverage metric (static deck scan + runtime tally via programConfidence,
  median over real decks, surfaced in LearnView — the climbing number).
P2.9 — Broad anthem/lord/grant expansion (grow staticAbilityParser).
P2.10 — Beginner trigger-target / "may" interaction (F7b — extend the decisionGate
  ask contract for triggers).
P2.11 — Activated abilities (new activate-ability action kind paying tap/mana/
  sacrifice under the `activated.effect` key; fully deferred today).
P2.12 — Replacement effects (CR 614/616: enters-tapped/with-counters + die
  replacement; entry-event hook on the ETB seam; hardest, a miss is safe).
P2.13 — cardEffects named-card override hook + facade removal (the closer).

First three: P2.1 seam → P2.2 interpreter → P2.3 pump.

## The biggest risk to respect

A false-confident parse that executes the WRONG behavior silently is worse than a
no-op (it's wrong AND silent — the opposite of the teaching mandate). Mitigation:
conservative-by-construction confidence (any unmodeled token → low → Arbiter); a
pinned "this oracle MUST drop to low confidence" parser corpus as a CI merge gate,
so every widening of "high" is a deliberate, reviewed act.

## Process + landmines

- Verify EVERY push with BOTH `cd app && npm run lint` AND `npm test`. CI's test job
  runs `eslint . --max-warnings 0` and fails on ANY warning; `npm test` does NOT
  lint. Branch protection does NOT block a failing check — before merging confirm
  `gh pr checks <n>` literally says `pass` (the `--watch` exit code lied once).
- Stage EXPLICIT paths, not `git add -A` — `git add -A` twice swept an untracked
  stray doc onto the layers branch. Check `git status` before committing.
- Ship: feature branch → PR to master → CI green (test) → merge → bump
  app/package.json AND app/src-tauri/tauri.conf.json + CHANGELOG.md →
  `git tag vX.Y.Z -a -m "..." && git push origin vX.Y.Z` → release CI (~17 min) →
  auto-update. Conventional Commits; end commits with
  "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>".
- Before shipping a slice, run an adversarial review (a Workflow: review across
  dimensions → independently verify each finding → fix the real ones). The Phase-1
  layers review caught 10 real findings (incl. two anti-fabrication violations) —
  do the same here.
- CONTRACT-MIG: any PR that changes the persisted game-state shape ships a
  learnSaveSchema MIGRATIONS[N] entry + a save-v<N> fixture test in the same PR.
- Arbiter (/api/arbiter) is Ollama-only — never route it to Anthropic regardless of
  the UI tier. The engine never calls it; the UI does.

## Start here

1. Read CLAUDE.md + docs/phase7-engine-rebuild.md §4 + docs/design/engine-rebuild/
   04-effect-interpreter.md + 06-test-and-realism.md + the two memory files.
2. From clean master: `cd app && npm test` (~1467 green) and `npm run lint` (clean)
   — confirm the baseline.
3. Build P2.1 (the unresolved→Arbiter seam) with the ultracode process: small TDD
   sub-PRs, lint+test after each, adversarial review of the diff, batched PR,
   release at a user-visible milestone. Then P2.2 (interpreter) → P2.3 (pump).
```
