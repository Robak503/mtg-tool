# MTG Tool — Project Handoff & Next Steps

> **Single source of truth for "where we are and what's next."** Start any new
> chat by reading this file plus `CLAUDE.md` (the operating manual). This
> supersedes and folds in the two older handoffs:
> - `docs/production-cleanup-plan.md` → archived to `docs/archive/` (deep
>   per-area code findings live there if you need them).
> - `docs/phase6-handoff.md` → folded into **Track 2** below and deleted.
>
> **For the full prioritized backlog + product strategy, see
> [`docs/master-plan.md`](master-plan.md)** — the consolidated strategic source of
> truth (CEO review + implementation plan + feature research + the Vault menu).
> This HANDOFF is its tactical companion. ⚠️ *This file is stale below — it
> predates v0.6–v0.10; trust `CHANGELOG.md` / `master-plan.md` §2 for shipped
> state until it's refreshed (master-plan O2).*

**Last updated:** 2026-05-30 · **Master:** `3cd6277` (green).

---

## TL;DR — current state

- **Green master.** 775 vitest tests passing; CI gates **both** languages:
  `ci.yml` (JS lint + tests on every PR) and `rust.yml` (rustfmt + clippy
  `--release -D warnings` + cargo-audit, path-filtered to `app/src-tauri/**`).
- **Two feature releases shipped since this doc last moved.** **v0.4.0 — The
  Vault** (collection manager: per-printing selector with finish/treatment
  buttons sourced from the full `default_cards` index, quantity steppers, color
  tags with ownership behaviors). **v0.5.0 — deck import from a Moxfield/Archidekt
  URL** (paste → fetch → resolve cards → save to library). Both signed +
  auto-updating.
- **Phase 6 learn engine advanced to PR 10 — combat damage.** The combat-damage
  step is no longer a no-op: creatures deal/take damage, lethally-damaged
  creatures die, unblocked attackers hit the chosen defender. Multi-defender
  (`defenderId` end-to-end), an AI defender heuristic, and all-opponent trap
  detection also landed. (On branch `feat/learn-pr10-combat` / its PR.)
- **The production-cleanup pass is essentially complete** (Track 1 below — tail
  only).
- **Three tracks remain.** Track 1 (cleanup tail — verification-gated), Track 2
  (Phase 6 — next is **PR 11**, the 4P LearnView UI), Track 3 (Vault Stage 2 —
  planned-but-unowned decks + cost-to-finish).

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

**› Big refactors E3/E4 (fresh context recommended):**
> Decompose the oversized frontend (E3: `MTGAssistant.jsx` ~1150 lines,
> `FeedbackButton.jsx` ~1241) and/or split the big modules (E4: `agents.js`,
> `powerRanker.js`, `lib.rs`). Read `docs/HANDOFF.md` Track 1 and the archived
> `docs/archive/production-cleanup-plan.md` §4 for the per-file findings. JS
> splits are verified by `npm test` + lint; a `lib.rs` split needs you to
> smoke-test the built `.exe` (tray, server spawn, updater).

**› Phase 6 Learn-to-Play, PR 11 (feature work):**
> Continue MTG Tool Phase 6 (Garfield Learn-to-Play). Read `docs/HANDOFF.md`
> Track 2, then `docs/phase6-learn-to-play.md` §11 (Commander 4P). The engine is
> at PR 10 (combat damage + multi-defender, shipped). Next is **PR 11 — the
> LearnView 4P UI**: three opponent strips (life / commander damage / hand / board),
> a mode + format picker wired to `detectDeckFormat`, and a defender-pick prompt in
> combat. `LearnView.jsx` is currently Standard-1v1 only.
> `npx vitest run src/lib/learn/` for fast iteration.

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
- **`knowledge/` consolidation (Job 2):** folded the two root reference dirs into
  one — `MTG ENGINE/` → `knowledge/mtg-engine/` (kills the space in the path) and
  `mtg-judge/` → `knowledge/mtg-judge/` (history preserved via `git mv`). All path
  code/docs updated (`paths.js`, `lib.rs`, `prepare-tauri-resources.cjs`,
  `strip-standalone-bloat.cjs`, dev scripts, `.gitignore`). Also dropped 6 unused
  `mtg_*.py`/`.sh` build scripts and the two `cite_audit*.md` QA reports (the latter
  were polluting rules retrieval via `isJudgeContextFile`).

### Remaining — verification-gated (need YOUR running `.exe`/webview)
1. **Webview CSP** — a bad policy blanks the app; confirm live.
2. **Local-first art** — proxy hover/search/add-modal art through `/api/art-crop`.
3. **Baseline audits** — run gstack `/health` + `/cso` once against the clean tree.

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

## Track 2 — Phase 6 Learn-to-Play (status: PR 10 shipped; PR 11 next)

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
1. **PR 10 — combat damage + multi-defender. ✅ Shipped.** The `combat-damage`
   step now resolves through `combatResolution.js`: simultaneous damage, lethal
   creatures move to the graveyard, unblocked attackers hit their chosen
   `defender`; `beginning/end-of-combat` reset combat (clearCombat was never wired
   in), `cleanup` wears off marked damage. Multi-defender is end-to-end
   (`legalChoices` emits per-defender in Commander, the dispatcher honors
   `defenderId`), `opponentAI` picks a defender heuristically (lowest-life, ties →
   fewest untapped blockers), and `trapDetector` scans all opponents. +15 tests
   (learn suite 287→292). **Deferred:** first strike / trample / deathtouch and
   the commander-damage 21-loss SBA (lands with the 4P UI in PR 11).
2. **PR 11 — LearnView 4P UI (the big one now).** 3 opponent strips (life/cmd-damage/hand/board),
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
