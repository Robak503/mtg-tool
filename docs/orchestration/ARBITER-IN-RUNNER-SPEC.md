# Arbiter-in-runner — build spec (Omnath sim-center handoff #2)

**Status:** READY TO BUILD (architecture mapped + design question resolved 2026-07-08). Not yet built.
**Goal (Colton):** *"arbiter needs to resolve always at the highest level."* Today a GATED card in headless
self-play is a pure no-op (`spell-unresolved`) — the effect never happens. Make the RUNNER resolve gated cards
via the Ollama Arbiter, apply the ruling, and CACHE it (the same ~30 cards repeat — Garruk's Uprising 307×).
The engine stays PURE (deterministic); the LLM lives only in the runner.

## Core design decision (RESOLVED)
A runner-level **live** LLM resolve CANNOT coexist with the deterministic trajectory-hash guarantee (probe
demands ×2-reproducible byte-identical hashes; Ollama sampling + 120s-timeout→fallback is non-deterministic, and
ANY mid-game mutation shifts the 5706-row fingerprint). **Therefore: resolve-once → memoize a fixed
per-card(+situation) verdict → replay deterministically from a frozen cache.** The verdict cache file is the
determinism boundary.

## The 5-step seam
1. **Keep the engine pure.** No network in `advanceUntilDecision` / `runEffectProgram` (stated invariant:
   `docs/design/engine-rebuild/04-effect-interpreter.md:435`). The engine keeps emitting `pendingArbiter` as today.
2. **Intercept in the RUNNER** at the existing Expert no-op branch — `learnSession.js:1016-1042` (today: clear +
   `continue`) — behind a NEW **default-off** `advanceOpts.resolveArbiter(pa, state) → effect|null` hook. Mirror
   the existing opt-in pattern (`decide`/`recordDecision`/`onTurnStart` threaded via advanceOpts,
   `selfPlayRunner.js:345-350`). Absent ⇒ byte-identical, `ab524e20`/5706 preserved.
3. **Cache-first, deterministic resolver.** Key = `cardName` (+ optional `progressSignature`-style situation-sig
   for board-dependent rulings). **HIT → synchronous** verdict → apply → continue (keeps `advanceUntilDecision`
   SYNCHRONOUS — no async refactor needed for the hashed run). **MISS →** resolve OUTSIDE the hashed loop (async
   pre-pass, step below); during a hashed run a miss falls back to today's no-op (never fabricate).
4. **Async PRE-PASS (cache warmer).** A one-time async runner-side pass: play/scan to collect all `pendingArbiter`
   cards, query the Arbiter ONCE each, write verdicts to `profilePath("arbiter-verdicts.json")`. Then the hashed
   batch runs fully synchronous off the warm, frozen cache.
5. **Apply deterministically.** Store each verdict as a small **structured atom program** and run it through the
   existing `runEffectProgram` (same state + same cached verdict ⇒ identical mutation). Do NOT parse prose.

## Determinism contract
- Hook OFF (default) ⇒ hash unchanged: `ab524e20`, games=3 rows=5706 seed=1.
- Hook ON with a FROZEN verdict cache ⇒ deterministic + ×2-reproducible, yielding a NEW anchor (≠ ab524e20) to
  re-baseline ONCE. Content-hash the verdict cache file so the new anchor is defined relative to a specific
  verdict set. A live in-loop LLM call can NEVER satisfy ×2-reproducibility.

## File:line seams (from the architecture map)
- **pendingArbiter set / marker:** `pendingArbiter.js:24-47` (`markPendingArbiter`; field `{stackObjectId,
  cardName, oracle, reason, controller}`; emits `spell-unresolved`). Callers: `resolvers.js:625-626` (spell.noop),
  `effects/runProgram.js:26` (low-confidence program). `clearPendingArbiter` = `learnSession.js:457-461`.
- **Interception branch:** `learnSession.js:1016-1042`. Fire condition today: `pa.controller === "user" &&
  difficulty !== "expert"` (:1018) → only a HUMAN's spell pauses; self-play forces `difficulty:"expert"`
  (`selfPlayRunner.js:262`) so it always clears+continues. Replace that clear with hook-apply-then-continue.
- **Runner loop:** `advanceUntilDecision` = `learnSession.js:922` (SYNCHRONOUS, `while ticks<SAFETY_CAP` :960);
  `runSelfPlayGame` = `selfPlayRunner.js:179` (SYNC); drive call `selfPlayRunner.js:357`. A cache-HIT resolve is
  sync-safe; a network resolve is NOT possible in-loop → that's why the pre-pass is separate.
- **Arbiter callable (Ollama-only, hardcoded):** route `api/arbiter/route.js:109` (HTTP-only as written; input
  needs a pre-composed NL `question` via `arbiterSeam.js:21-30 composeArbiterQuestion`; output = prose `trace` +
  `status`). Node-callable building block: `callModelMessages` (`modelProvider.js:263`) → `callOllamaMessages`
  (:179, direct `fetch(OLLAMA_BASE_URL/api/chat)`). Model `qwen2.5:14b` (`route.js:9`, env `OLLAMA_ARBITER_MODEL`).
  **Recommend:** extract a shared `runArbiter(body)` plain async fn from `POST` to reuse retrieval+citation-guard,
  OR call `callModelMessages` directly for a leaner runner path. Deterministic verdict mode already exists:
  `route.js:62-107` (`deterministicVerdict`/`buildDeterministicTrace`, gated by `validationMode`/`deterministicOnly`).
- **Cache store (build new, model on this):** `colorTagStore.js` (per-profile durable JSON, sanitize-on-write,
  survives reinstall). Primitives: `atomicJson.js` — `atomicWriteJson(path,payload)` :17, `readJsonSafe(path)` :30.
  Location: `profilePath("arbiter-verdicts.json")` (`paths.js:181 profilePath()`; same writable home trajectories
  use, `selfPlayRunner.js:995-996`).
- **Situation-sig prior art:** `learnSession.js:441 progressSignature(state)` (joins turn/phase/step/attackers/
  blockers/stack/hand/pool/bf/pendings → cheap fingerprint). Richer: `gameFeatures.js:143 featurizeState`.
- **Ruling→effect:** NO prose applier exists (`continueFromArbiter` :1651-1683 only clears+logs — "engine never
  fabricates it"). Build a MINIMAL applier that consumes a structured verdict → atom program and reuses
  `runEffectProgram` (`effects/runProgram.js`) + the atom library (`effects/atoms/*`). No NL→state applier.
- **Hash mechanism:** probe spec `docs/orchestration/PLAY-HARNESS-OVERHAUL-PLAYBOOK.md:55-88` —
  `runSelfPlayBatch(decks,{mode:"commander",gamesPer:3,timePressure:true,recordDecisions:true})` seed=1, sha256 over
  per-game `{result,turns,winnerSeat}` + every `decisionTrajectory.rows` (row = `{turn,seat,pilot,features,action}`,
  `selfPlayRunner.js:331-338`). ×2-reproducible required (:88).

## Suggested build order (bottom-up, each verifiable)
1. **`arbiterVerdictStore.js`** — get/put/has by key, `atomicWriteJson`, `profilePath("arbiter-verdicts.json")`,
   content-hash helper. Test: round-trip + per-profile isolation. (No LLM, no determinism risk.)
2. **Structured-verdict → atom applier** — `applyArbiterVerdict(state, verdict) → state` via `runEffectProgram`.
   Test: a canned verdict mutates state as expected; an empty/unknown verdict = clean no-op.
3. **`resolveArbiter` hook + wiring** — default-off `advanceOpts.resolveArbiter`; wire into `learnSession.js:1016`
   (HIT→apply, MISS→today's no-op); thread through `runSelfPlayGame`/`runSelfPlayBatch`. Test: OFF ⇒ trajectory
   hash `ab524e20`/5706 UNCHANGED (the cardinal guard); ON with a seeded cache ⇒ a gated card actually resolves.
4. **Async pre-pass (cache warmer)** — collect pendingArbiter cards across a batch, query Arbiter once each (needs
   Ollama up; gate behind an explicit flag), write verdicts. Test with Ollama running; verify Garruk's Uprising
   collapses to ONE query.
5. **Re-baseline** the ON-anchor once (content-hashed to the verdict set); document both anchors in WAKE-REPORT.

## Verification gates (every step)
`ab524e20`/5706 hash held with hook OFF · lint 0 · `runEffectProgram` purity intact · a real gated card (start
with Garruk's Uprising) resolves correctly ON · full suite green. Engine stays pure — the LLM never enters the
hashed loop.
