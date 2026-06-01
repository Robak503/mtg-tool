# MTG Tool — Project Handoff & Next Steps

> **Tactical "where we are / what's next" doc.** Start any new chat by reading
> this + `CLAUDE.md` (operating manual). For the full prioritized backlog +
> product strategy, see **[`docs/master-plan.md`](master-plan.md)** (the strategic
> source of truth). `CHANGELOG.md` is authoritative for shipped state.

**Last updated:** 2026-05-31 · **Master:** green · **Tests:** 951 vitest · **Lint:** 0 warnings.

---

## TL;DR — current state

- **Latest release: v0.11.0** (signed + auto-updating). It shipped the safety
  batch — local-first provider allowlist (a typo can't spend API credits),
  feedback path-traversal fix, chat-state persistence across reload, immediate
  in-app-sync cache invalidation, streaming idle timeouts — plus price snapshots
  firing on app launch.
- **A large `[Unreleased]` backlog is on master**, much of it **backend-complete
  but not yet surfaced in the UI** (see the two tables below). The next release
  should wait until the remaining buttons are wired so it ships user-visible.
- **CI gates both languages:** `ci.yml` (lint + ~951 vitest on every PR),
  `rust.yml` (rustfmt + clippy `--release -D warnings` + cargo-audit). Lint is
  now clean (0 warnings).
- **Three workstreams remain:** (1) surface the dormant backend in the UI,
  (2) the genuinely-new features (Karn-applies, Build-From-Vault, alerts,
  Settings), (3) Phase 6 Academy (PR 11+). Cleanup/tech-debt is essentially done.

## What's shipped vs. what's dormant (the key picture)

**Surfaced + live (in `[Unreleased]`, ready to release):**
| Feature | Status |
|---|---|
| Deck Report (F1) + Rule 0 card (F2) | route + **UI in the deck view** |
| Collection CSV export (G3) | route + **"Export CSV" button in the Vault** |

**Backend done + tested, NO UI yet (dormant — wire a button to ship):**
| Feature | Endpoint |
|---|---|
| Shopping-list export (G2) | `POST /api/collection/shopping-list` |
| Export-all backup (K1) | `GET /api/export-all` |
| Restore-from-backup (I2/I3) | `POST /api/import-all` (backs up first) |
| Support bundle (D5) | `GET /api/support-bundle` |
| Seed price history (#4) | build-time; verify Finance has day-1 data after next release |

## How to start the next chat (copy a block)

**› Wire the dormant endpoints (quick, in-app, proven pattern):**
> Surface the dormant backends in the UI: a "Copy support info" button
> (`/api/support-bundle`) in the Updates modal; a shopping-list **Export** button
> (`/api/collection/shopping-list`) in the Vault Decks panel; and export-all /
> restore in a Settings area. Mirror the Deck Report / Export-CSV buttons already
> wired (`DeckView.jsx`, `CollectionView.jsx`). Verify in `npm run dev`.

**› Webview CSP (security; needs the app running):**
> Add a webview Content-Security-Policy to the Tauri shell. Start `npm run dev`
> in `app/` (and/or `tauri:build`) FIRST — a too-strict CSP blanks the whole app,
> so confirm against the running window before commit. (master-plan A6 / CSP.)

**› Local-first art proxying (needs the app running):**
> Route the last card-art fetches (hover tooltip, right-panel search preview,
> CollectionAddModal) through `/api/art-crop?name=` instead of the Scryfall CDN.
> Verify each surface renders art live. (master-plan N4.)

**› High-value features (master-plan §4–§5):**
> Pick one: **Karn applies a cut/add** to the deck (E1, the core-loop unlock),
> **Build-From-Vault** deckbuilding (G1), **price alerts** (#1) / **sparklines**
> (#2), or a **Settings screen** (D1) housing export-all/restore/support/privacy.

**› Phase 6 Learn-to-Play, PR 11 (feature work):**
> Continue Phase 6 (Garfield Academy). Read `docs/phase6-learn-to-play.md` §11.
> Engine is at PR 10 (combat damage + multi-defender, shipped v0.6.0). Next is
> **PR 11 — the 4P LearnView UI** (3 opponent strips, mode/format picker wired to
> `detectDeckFormat`, defender-pick prompt). `npx vitest run src/lib/learn/`.

---

## Workstream 1 — Surface the backend in the UI

The session that produced this backlog built many local-first endpoints (Deck
Report, Rule 0, the export/backup/restore family, support bundle) and surfaced
the two biggest (Deck Report, collection export). The rest need a button each —
all low-risk, all reusing the app's proven `fetch → render`/`Blob-download`
patterns. Then cut the next release so it's all user-visible.

## Workstream 2 — New high-value features (not started)

From `master-plan.md` §4–§5, roughly by leverage:
- **Core loop:** Karn *applies* a cut/add to the deck (E1); "play this deck in
  the Academy"; cost-to-finish shown in the deck view.
- **Collection-aware:** Build-From-Vault deckbuilding (recommend from owned first).
- **Vault:** price alerts (#1), sparklines (#2), value-over-time chart (#3),
  stats dashboard (#10), set completion (#11), bulk edit (#12), binders (#13),
  set browser + price list (#23).
- **Public-release:** Settings screen (D1), Privacy/About (D2), stability labels.
- **Activation/trust:** empty-state deck chip, ask-via-API-while-downloading,
  model-pull progress, "Jace is reasoning…" streaming state, trust badge,
  graceful 14B→7B fallback.

## Workstream 3 — Phase 6 Academy (feature track)

**Design SoT:** `docs/phase6-learn-to-play.md` (§11 = Commander). **Two modes
only** — Standard 1v1 and Commander 4P; never an abstract N-player engine.
Engine state + file map below.

- **Engine today:** `state.mode`/`turnOrder`; seat-aware `opponentsOf` /
  `nextInTurnOrder`; Commander = you + 3 pod AIs; player elimination; combat
  damage + multi-defender (shipped v0.6.0/v0.7.0); `detectDeckFormat` (not yet
  wired into the UI — that's PR 11).
- **Next:** PR 11 (4P LearnView UI) → PR 12 (Expert mode + post-game) → PR 13
  (learn-session persistence, `data/learn-sessions/`).
- **Files:** `app/src/lib/learn/{gameState,gameEngine,legalChoices,opponentAI,`
  `decisionGate,narrator,actionDispatcher,trapDetector,learnSession,`
  `combatResolution,formatDetection}.js` (+ tests); UI
  `app/src/components/mtg/LearnView.jsx` + `hooks/useLearnSession.js`; routes
  `app/src/app/api/learn/{start,step,ask}/route.js`.

## Tech-debt — essentially cleared

Done: lint warnings → 0; dead-code removal (`cardContext.js`); unique
atomic-write temp names; version-source alignment + drift guard; sync cache
invalidation; production-cleanup pass (atomic/race-free writes, never-fabricate
guard, CI gates). **Remaining:** decompose the oversized files (`MTGAssistant.jsx`
~1.2k lines, `FeedbackButton.jsx`, `powerRanker.js`, `lib.rs`) — headless but
large and behavior-sensitive (best done with the app available to smoke-test);
and the verification-gated items above (CSP, art proxy).

---

## Project quick-reference (cold chat)

- **What:** local-first MTG Commander assistant shipping as a signed Windows
  `.exe` (Tauri 2 → bundled Node 22 → Next.js 15, JavaScript; local Ollama with
  an Anthropic fallback tier).
- **Dev:** `cd app && npm run dev` (http://localhost:3000). **Test:** `npm test`
  or `npx vitest run <path>`. **Lint:** `npm run lint` (must stay 0).
  **Build .exe:** `npm run tauri:build`. **Rust gates:** `cargo fmt --check` +
  `cargo clippy --release` in `app/src-tauri/`.
- **Release:** stamp `CHANGELOG` `[Unreleased]→[vX.Y.Z]` (+ bump `package.json`
  *and* `tauri.conf.json` — a test enforces they match), then
  `git tag vX.Y.Z -a && git push origin vX.Y.Z` → CI builds + signs + publishes.
  See `RELEASE.md`.
- **Invariants:** local-first (external calls need a local fallback); never
  fabricate rule numbers/card text; Arbiter is **Ollama-only**; always use
  `paths.js` helpers; surface errors (no silent `try/catch`).
- **PR flow:** branch off `master` (direct push blocked), one concern per PR,
  verify (`npm test` + `lint` + `check`; `cargo`/`tauri:build` for Rust/build),
  open PR, wait for green CI, squash-merge.
