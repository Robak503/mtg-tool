# MTG Tool — Project Handoff & Next Steps

> **Single source of truth for "where we are and what's next."** Start any new
> chat by reading this file plus `CLAUDE.md` (the operating manual). This
> supersedes and folds in the two older handoffs:
> - `docs/production-cleanup-plan.md` → archived to `docs/archive/` (deep
>   per-area code findings live there if you need them).
> - `docs/phase6-handoff.md` → folded into **Track 2** below and deleted.

**Last updated:** 2026-05-29 · **Master:** `caf0436` (green).

---

## TL;DR — current state

- **Green master.** 690 vitest tests passing; CI gates **both** languages now:
  `ci.yml` (JS lint + tests on every PR) and `rust.yml` (rustfmt + clippy
  `--release -D warnings` + cargo-audit, path-filtered to `app/src-tauri/**`).
- **The production-cleanup pass is essentially complete.** Over ~25 merged PRs:
  the full code-review fix tier (data integrity, never-fabricate, resilience,
  supply-chain), a real test safety net, JS+Rust tooling parity, naming/dedup
  cleanup, and a full documentation/"humanization" pass (every component +
  backend file is headed; the frontend style vocabulary is documented).
- **Two work tracks remain.** Track 1 (cleanup tail — mostly verification-gated)
  and Track 2 (the Phase 6 Learn-to-Play feature, paused at PR 9).

## How to start the next chat (copy a block)

Pick the step you want, open a fresh chat, paste the block. Each is
self-contained on top of `CLAUDE.md` + this file.

**› Webview CSP (security; needs the app running):**
> Add a webview Content-Security-Policy to the Tauri shell. Read `docs/HANDOFF.md`
> Track 1 → "Verification-gated." Start `npm run dev` in `app/` (and/or a
> `tauri:build`) FIRST — a too-strict CSP blanks the whole app, so every change
> must be confirmed against the running window before commit.

**› Local-first art proxying (needs the app running):**
> Route the remaining card-art fetches (hover tooltip, search preview,
> CollectionAddModal) through the local `/api/art-crop?name=` proxy instead of
> the Scryfall CDN, per the local-first prime directive. Read `docs/HANDOFF.md`
> Track 1. Verify each surface renders art in the running app.

**› `knowledge/` directory consolidation (Job 2 — needs `tauri:build`):**
> Rename and fold the two root-level reference dirs under one `knowledge/` dir:
> `MTG ENGINE/` → `knowledge/mtg-engine/` (kills the space in the path) and
> `mtg-judge/` → `knowledge/mtg-judge/`. Use `git mv` to preserve history.
>
> **What actually reads these dirs (don't break them):**
> `mtg-judge/data/cr/cr_current.json` and `mtg-judge/META_test_cases_rulesguru.md`
> (via `mtgJudgePath()`); the `MTG ENGINE/*.md` rule layers (via `mtgEnginePath()`);
> and `app/src/app/api/engine/route.js` walks the judge + engine roots, filtering
> with `isJudgeContextFile`.
>
> **Update every path reference:** `app/src/lib/server/paths.js`
> (`mtgJudgePath`/`mtgEnginePath` dev-tree fallbacks + any `MTG ENGINE`/`mtg-judge`
> string literals), `app/src-tauri/src/lib.rs` (the `MTG_ENGINE_DIR`/`MTG_JUDGE_DIR`
> env values), `app/scripts/prepare-tauri-resources.cjs` (the staging copy),
> `.gitignore`, `tauri.conf.json` if it names them, plus test fixtures and
> CLAUDE.md/docs references. Grep the repo for `MTG ENGINE` and `mtg-judge`.
>
> **Verify in two stages:** (1) `npm test` + `npm run dev` confirm the DEV path
> (paths.js fallbacks) resolves a rules query; (2) `npm run tauri:build`, then
> LAUNCH the built `.exe` and confirm a rules query works — that's the only check
> that the packaged app's bundled paths are right. Owner does the final .exe smoke.
>
> **Optional while in here:** `mtg-judge/` still has 6 unused data-build scripts
> (`mtg_*.py`, `mtg_bootstrap_local.sh`) and two citation-audit reports
> (`cite_audit.md`, `cite_audit_v2.md`) that `engine/route.js` currently loads as
> retrieval context via `isJudgeContextFile` — decide whether those QA reports
> belong in the rules corpus (if not, drop them from that list and delete them).
> (`THE KEY.txt`, `report.md`, `run_v3.md` were already removed.)

**› Big refactors E3/E4 (fresh context recommended):**
> Decompose the oversized frontend (E3: `MTGAssistant.jsx` ~1150 lines,
> `FeedbackButton.jsx` ~1241) and/or split the big modules (E4: `agents.js`,
> `powerRanker.js`, `lib.rs`). Read `docs/HANDOFF.md` Track 1 and the archived
> `docs/archive/production-cleanup-plan.md` §4 for the per-file findings. JS
> splits are verified by `npm test` + lint; a `lib.rs` split needs you to
> smoke-test the built `.exe` (tray, server spawn, updater).

**› Phase 6 Learn-to-Play, PR 10 (feature work):**
> Continue MTG Tool Phase 6 (Garfield Learn-to-Play). Read `docs/HANDOFF.md`
> Track 2, then `docs/phase6-learn-to-play.md` §11 (Commander 4P). The engine is
> at PR 9 (Commander 4P session start). Next is **PR 10 — multi-defender combat +
> combat-damage application** (combat damage is currently a no-op; this is the
> core gap). `npx vitest run src/lib/learn/` for fast iteration.

---

## Track 1 — Production cleanup (status: tail only)

### Done (the bulk — full detail in git history + `docs/archive/`)
- **Correctness/security:** engine `TOOL_ROOT` 500 + `__dirname` packaging bugs;
  atomic + corrupt-recovering + race-free writes for decks / chats / collection;
  never-fabricate citation guard + Arbiter ollama-only invariant test; resilient
  data loaders; Node-download SHA-256 verification.
- **Tooling/CI:** ESLint + Prettier + knip; `ci.yml` test gate; **`rust.yml`**
  (rustfmt + clippy-release + cargo-audit); flaky-suite stabilization
  (`vitest.config.mjs` 20s timeout + poll-based prune test).
- **Tests:** `powerRanker`, Arbiter invariant, `rulesRetrieval` parsers, and
  smoke tests for the 8 previously-untested routes (which surfaced + fixed a
  bad-JSON-→-500 inconsistency in 3 routes).
- **Naming/dedup:** `verb:noun` npm scripts; disambiguated duplicate fn names
  (`searchLocalCards`/`searchScryfall`, `detectCardNamesFromCatalog`,
  `normalizeComboName`); shared `collectionValidation.js` + `sanitiseId.js`.
- **Docs/humanization:** `LICENSE`/`CONTRIBUTING`/`ARCHITECTURE`/`SECURITY`/
  `CHANGELOG`/README; archived stale `AUDIT.md`; **every component now has a file
  header** and the terse style vocabulary (`cfg`/`pb`/`sb`/`F`/`bg`/`bg3`/…) is
  decoded by a legend in `MTGAssistant.jsx`.

### Remaining — verification-gated (need YOUR running `.exe`/webview)
1. **Webview CSP** — a bad policy blanks the app; confirm live.
2. **Local-first art** — proxy hover/search/add-modal art through `/api/art-crop`.
3. **`knowledge/` rename** — touches the signed bundle; verify with `tauri:build`.
4. **Baseline audits** — run gstack `/health` + `/cso` once against the clean tree.

### Remaining — headless but large (fresh context)
- **E3** — decompose `MTGAssistant.jsx` / `FeedbackButton.jsx` into smaller files.
- **E4** — split `agents.js` (mostly one 630-line prompt), `powerRanker.js`
  (now test-covered), `lib.rs` (5 concerns; the Rust gate verifies it compiles).
- **E5 (rest)** — dedupe remaining backend overlap (feedback store, card-context
  builders).
- **Minor** — a few leftover `(Step N)` provenance parentheticals in
  `collectionContextBuilder.js`, `collection/page.jsx`, and the add/import modals.
- **Skipped on purpose** — `C2` git hooks (low value: CI already gates; fiddly in
  the `app/`-package + repo-root-`.git` layout).

---

## Track 2 — Phase 6 Learn-to-Play (status: paused at PR 9)

This is a **feature track**, independent of the cleanup. The owner flagged it as
separate; nothing in the cleanup work touched the learn engine.

**Design source of truth:** `docs/phase6-learn-to-play.md` (§11 = Commander
expansion, §11.9 = format detection). **Two modes only** — Standard 1v1 and
Commander 4P; never build an abstract N-player engine (codepaths fork at 2 vs 4
and nowhere else).

### Engine state (what works today)
- **Modes:** `state.mode` (`"standard"|"commander"`) + `state.turnOrder` seat
  array. Seat-aware primitives `opponentsOf` / `nextInTurnOrder` scale 2↔4.
  (`opponentOf` is retained but **Standard-only** — mode-aware code must not use it.)
- **Commander = 4 players:** you + exactly 3 pod AIs (`ai1/ai2/ai3`), enforced in
  `createGameState`, `createLearnSession`, and `/api/learn/start`. Per-opponent AI
  picks actions from each seat's own board; `decisionGate` auto-decides for any
  non-user seat.
- **Player elimination** (`learnSession.js`): user dead → loss; all opponents
  dead → win; a non-final opponent death prunes that seat (CR 800.4a) and play
  continues.
- **Format auto-detection** (`formatDetection.js`): `detectDeckFormat(deck)` →
  100-card → commander, 60±SB → standard. `format` string == `state.mode`. **Not
  yet wired into the UI** (that's PR 11).

### Next work
1. **PR 10 — multi-defender combat (the big one).**
   - `declare-attacker` needs a real `defenderId` (dispatcher accepts it but today
     defaults to the first opponent, so all AI attacks hit the user).
   - AI defender heuristic: attack lowest-life opponent (ties → fewest untapped
     blockers) — design §11.5.
   - **Combat-damage application is NOT implemented** — the `combat-damage` step is
     a no-op, so nothing dies from combat in either mode. This is the core gap.
   - Extend `trapDetector` counter-attack check to all opponents (today only the first).
2. **PR 11 — LearnView 4P UI.** 3 opponent strips (life/cmd-damage/hand/board),
   mode + format picker wired to `detectDeckFormat`, defender-pick prompt.
   `LearnView.jsx` is currently Standard-1v1 only.
3. **PR 12 — Expert mode + post-game analysis (mode-aware).**
4. **PR 13 — learn-session persistence** (`data/learn-sessions/`).

### Engine file map
`app/src/lib/learn/{gameState,gameEngine,legalChoices,opponentAI,decisionGate,`
`narrator,actionDispatcher,trapDetector,learnSession,formatDetection}.js` (+ tests).
UI: `app/src/components/mtg/LearnView.jsx` + `hooks/useLearnSession.js`.
Routes: `app/src/app/api/learn/{start,step}/route.js`.

---

## Project quick-reference (for a cold chat)

Full detail is in `CLAUDE.md`. The essentials:

- **What it is:** local-first MTG Commander assistant shipping as a signed Windows
  `.exe` (Tauri 2 shell → bundled Node 22 → Next.js 15, JavaScript not TS; local
  Ollama with an Anthropic fallback tier).
- **Dev:** `cd app && npm run dev` (http://localhost:3000). **Test:** `npm test`
  (wrapped 5-min watchdog) or `npx vitest run <path>`. **Lint:** `npm run lint`.
  **Build .exe:** `npm run tauri:build`. **Rust gates:** `cargo fmt --check` +
  `cargo clippy --release` in `app/src-tauri/`.
- **Release:** `git tag vX.Y.Z && git push origin vX.Y.Z` → CI builds + signs +
  publishes. See `RELEASE.md`.
- **Hard invariants:** local-first (external calls need a local fallback); never
  fabricate rule numbers/card text; Arbiter is **Ollama-only**; always use
  `paths.js` helpers (never raw `process.cwd()`/`__dirname` in app code); surface
  errors (no silent `try/catch`).
- **PR flow:** branch off `master`, one area per PR, verify (`npm test` + lint;
  `cargo`/`tauri:build` for Rust/build changes), open PR, wait for green CI, merge.
- **Note:** the untracked `docs/phase6-handoff.md` is removed by this doc — its
  content is folded into Track 2 above.

---

*Remove a track from this file once it's truly finished. When BOTH tracks are
done, this doc can itself be archived.*
