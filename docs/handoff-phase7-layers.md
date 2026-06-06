# Handoff prompt — MTG Tool, Phase 7 PR-9..12 (CR 613 layers engine)

Paste the block below into a new chat to continue the Phase 7 engine rebuild with
the CR 613 continuous-effects / layers slice. It's written to be self-contained,
but the new session should still read `CLAUDE.md` and the docs it points to before
touching code.

This is the **last and highest-blast-radius Phase-1 Foundation slice** (PR-11 swaps
the single P/T accessor that feeds combat, SBAs, legality, and the UI). It was
deliberately handed to a fresh run so it gets full focus.

---

```
ultracode

You are Claude Code continuing work on MTG Tool — a local-first, Tauri-packaged
Windows .exe Magic: The Gathering Commander assistant. Read CLAUDE.md FIRST (it's
the operating manual and overrides defaults). Owner is Colton (vibe-coder; he
directs, you build; you have full architectural authority and standing permission
to commit/push/PR/merge and cut releases without per-step approval until he stops
you or you run out of tokens). Repo: https://github.com/Robak503/mtg-tool. Be
exhaustive and adversarially verify.

## Where things stand
The "Phase 7" maximal-fidelity engine rebuild is underway and going well. Two
slices are shipped to master and released:
- v0.23.0 — Foundation: the spell/ability stack is now data-driven + fully
  JSON-serializable (a {resolver, params} registry, no closures), ids are
  deterministic (state.idSeq/mintId), and mid-game save/resume works.
- v0.24.0 — Triggered abilities: ETB / dies / upkeep-draw-end / attack triggers
  fire end-to-end from real oracle text, APNAP-ordered, with the Arbiter as the
  fail-safe for anything unparseable.
Master is green: ~1283 vitest cases. The engine lives in app/src/lib/learn/ and is
pure + immutable (every helper returns new state).

## Your mission: PR-9..12 — the CR 613 continuous-effects / layers engine
This is the LAST Phase-1 Foundation slice, and the largest + highest-blast-radius
one. It adds anthems, tribal lords (the owner plays Slivers), granted keywords,
and the pump-duration mechanism. Build it as small TDD sub-PRs, suite green after
each, then ship as ONE batched PR when anthems/lords visibly change gameplay, and
cut v0.25.0.

## Read these first (they contain the locked design + binding decisions)
- CLAUDE.md (operating manual; §5 gotchas).
- docs/phase7-engine-rebuild.md — the roadmap. §3 has the PR-9..12 rows; §2 has
  binding decisions D1–D7; §7 risks; §11 the eng-review revisions.
- docs/design/engine-rebuild/03-cr613-layers.md — the full layers blueprint
  (exact data shapes, function signatures, sub-PRs L1–L7).
- docs/design/engine-rebuild/00-critique-reconciliation.md — the reconciled
  cross-section contracts (the canonical versions win over any single blueprint).
- Memory file project_phase7_engine_rebuild.md (it summarizes all of the above).

## The binding eng-review decisions for this slice (do NOT relitigate)
- Break the import cycle (F3): extract app/src/lib/learn/ptPrimitive.js (the
  printed+counters P/T math). layers.js imports ONLY ptPrimitive + keywords.js —
  NEVER gameState. gameState.creaturePower/creatureToughness delegate OUTWARD to
  layers, so the edge never reverses into a cycle. Make ptPrimitive a named PR-9
  deliverable.
- PR-9: build layers.js standalone — deriveCharacteristics(state, permanentId)
  collects ALL continuous effects (static abilities of other permanents =
  anthems/lords; resolved one-shot effects with durations = pump-until-EOT;
  +1/+1/−1/−1 counters; CDAs) and applies them in CR 613 layer order with
  timestamp (613.7) + dependency (613.8) ordering. WeakMap state-version memo +
  an empty-board fast path. Add state.continuousEffects[] + state.timestampCounter
  + permanent.timestamp (stamp the timestamp in the ETB path — enterPermanent in
  resolvers.js — alongside the existing id). NOT wired into creaturePower yet.
  CR correction: P/T-modifying counters are layer 7c (613.4c), NOT 7d; keyword
  counters are layer 6 (613.1f).
- PR-10: the EQUIVALENCE GATE — an exhaustive parity property-test proving
  permanentPower(state,id) === the current creaturePower(perm,state) across
  {printed P/T} × {+1/+1, −1/−1, both, none} × {0/negative toughness} × {Omnath at
  0..N floating green}. Mandatory and MERGE-BLOCKING before PR-11.
- PR-11 (highest blast radius): creaturePower/creatureToughness delegate to
  layers (via ptPrimitive, no cycle) when state is passed. Port Omnath from
  cardEffects.staticPTModifier to a layer-7c ptModifyDynamic descriptor; keep
  staticPTModifier as a thin shim. Gated by PR-10. Treat ANY integration-test red
  here as "the refactor changed behavior and is wrong," never "stale test." The
  accessor returns the TRUE CR value (can be negative); combat floors at 0
  (Math.max(0,…) already there), SBAs read raw (tough<=0 dies) —
  destroyLethalCreatures already calls creatureToughness(perm,state), so it gets
  layered toughness for free.
- PR-12: cleanup + granted keywords + AI rewire. expireContinuousEffects at
  cleanup (CR 514.2); add permanentHasKeyword(state,id,kw) that SEEDS from
  keywords.hasKeyword (imported, NEVER shadowed) and unions layer-6 grants
  (sliver lords); rewire combatResolution + legalChoices evasion/haste to
  permanentHasKeyword; delete the staticPTModifier shim. IN THE SAME WINDOW (F7a):
  route boardContext.js / trapDetector.js / opponentAI.js P/T reads through the
  derived accessor, so the AI never evaluates printed P/T while combat resolves on
  derived (no green-but-wrong gap).

## Process + landmines
- Verify EVERY push with BOTH `cd app && npm run lint` AND `npm test`. CI's test
  job runs `eslint . --max-warnings 0` and fails on any warning; `npm test`
  does NOT lint. (A red PR merged once this way — see memory
  feedback_lint_before_push.) Also: branch protection does NOT block a failing
  check, so before merging confirm `gh pr checks <n>` literally says `pass` — the
  `gh pr checks --watch` exit code lied once.
- Ship: feature branch → PR to master → CI green (test + rust) → merge →
  bump app/package.json AND app/src-tauri/tauri.conf.json + CHANGELOG.md →
  `git tag v0.25.0 -a -m "..." && git push origin v0.25.0` → release CI (~17 min)
  → auto-update. Conventional Commits; end commits with
  "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>".
- Landmines: card.type vs card.type_line (read both). Never shadow
  keywords.hasKeyword. Arbiter (/api/arbiter) is Ollama-only. All server file
  access via paths.js helpers. Phase-2 deferred (do NOT assume these work):
  protection/hexproof/ward/menace/indestructible, pump SPELL wiring (PR-9 builds
  the duration mechanism; wiring Giant Growth is later), tokens, X-spells,
  replacement effects, simultaneously-dying dies-watchers.

## Start here
1. Read CLAUDE.md + docs/phase7-engine-rebuild.md + docs/design/engine-rebuild/
   03-cr613-layers.md + 00-critique-reconciliation.md.
2. `cd app && npm test` (~1283 green) and `npm run lint` (clean) from clean
   master — confirm the baseline.
3. Build PR-9 → PR-12 with the ultracode process (roadmap status updates,
   per-PR lint+test, adversarial review of the diff before shipping, batched PR,
   release). PR-9 (ptPrimitive + layers.js standalone) is invisible/additive —
   start there.
```

---

*Generated 2026-06-06 after shipping the Foundation (v0.23.0) and triggered-
abilities (v0.24.0) slices. Keep this current as the layers slice lands.*
