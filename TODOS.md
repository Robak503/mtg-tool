# MTG Tool — TODOS

Grouped by skill/component, then priority (P0 at top, P4 at bottom).
Completed items live in the `## Completed` section so the open queue
stays readable.

---

## Infra / Workflow

### P0 — Set up GitHub remote for the project

**What:** Create a private GitHub repo, install `gh` CLI (or use a personal access token), connect `origin`, push `master` plus existing branches.

**Why:** Every commit currently lives on one SSD. Phase 2 + Phase 3 cleanup + the entire session manager UI + feedback capture + Garfield v2 disappear if the laptop dies or gets stolen. The Mac mini handoff (per CLAUDE.md) becomes `git clone` instead of `scp`. Every gstack skill (`/ship`, `/land-and-deploy`, `/canary`, `/review` PR comments) assumes a remote — without one we keep inventing workarounds (see `PR_SUMMARY.md` from 2026-05-26 as exhibit A).

**How to apply:**
1. Create a private GitHub repo at github.com/new (don't initialize with a README — we already have one).
2. Install `gh`: `winget install GitHub.cli` on Windows, or use a personal access token instead.
3. `git remote add origin git@github.com:<user>/mtg-tool.git` (or HTTPS URL).
4. `git push -u origin master`
5. `git push origin feat/phase3-cleanup feat/phase2-arbiter-retrieval` to push the existing branches too (for history).
6. After remote is up, `/ship` works normally for the next feature.

**Estimated time:** ~5-10 minutes including account creation if needed.

---

## Phase 6 — Learn-to-Play Mode

### P1 — Phase 6 PR2: gameEngine state machine

**What:** Build `app/src/lib/learn/gameEngine.js` per design doc §4. Turn/phase/step transitions, priority handling, trigger queue. Consumes the gameState helpers from PR1 (already shipped). ~500 LOC + tests.

**Why:** PR1 shipped the pure data layer. PR2 is the orchestrator — without it the engine can't advance through a turn cycle. After PR2 ships, PR3 (legal choices) can generate valid actions at each priority window.

**Depends on:** PR1 done (gameState.js + 56 tests on master). The state machine reads/writes the gameState via the helpers; no new data shapes needed.

**Reference:** `docs/phase6-learn-to-play.md` §4 (architecture) and §5 step 2.

---

## Persistence


## UI Polish

### P3 — Mobile UX for SessionSidebar

**What:** SessionSidebar only renders when `!mobile` in MTGAssistant.jsx. Mobile users have no session manager — they fall back to single-session-per-agent v1 behavior implicitly.

**Why:** Mobile is a real use case (per the existing `MobileTabBar` work). The current state means a phone user can't archive a chat or run multiple Karn chats.

**How to apply:** Two options: (1) make SessionSidebar collapsible into a drawer on mobile; (2) add a session tab to MobileTabBar that routes to a sessions-list view. Option 2 is simpler.

---

### P4 — Tests for new UI components

**What:** Add Vitest + React-testing-library coverage for FeedbackButton (inbox view rendering, submit success path), GarfieldPanel (insights fetch + render, archetype badge), SessionSidebar (active/archived toggle, rename, archive). Currently all 81 tests are server/lib — UI components are untested.

**Why:** UI bugs slip through `/qa` runs because we don't have a fast feedback loop. Component tests are cheap once the framework is wired.

**How to apply:** `npm install -D @testing-library/react jsdom`; switch vitest env to `jsdom` for `.jsx` tests; write the components.

---

## Completed

### ~~Wire Arbiter to Ollama~~ ✅ DONE (568554a, 2026-05-24)

`/api/arbiter/route.js` now calls `callModelMessages(payload)` where `payload.provider` comes from the client.

### ~~Rename `/api/anthropic` to `/api/chat`~~ ✅ MOOT (2026-05-26)

Route deleted entirely — chat traffic was already on `/api/chat-stream`.

### ~~Remove dead /api/anthropic route~~ ✅ DONE (feat/phase3-cleanup, 2026-05-26)

Was a 19-line pass-through to `callModelMessages`, not called anywhere.

### ~~Consolidate duplicate oracle caches~~ ✅ DONE (Phase 2 — cardIndex.js refactor)

Both `cards/route.js` and `cardContext.js` delegate to `cardIndex.js` singleton.

### ~~Pre-build oracle name index for faster cold starts~~ ✅ DONE (PR1: 2e1b947, 2026-05-26)

`scripts/build-oracle-index.cjs` + `npm run build:oracle-index`. `cardIndex.js` prefers `oracle-index.json` when present. 165MB → 29MB, ~3-5s cold start → ~200ms.

### ~~Extract streaming logic to modelProvider.js~~ ✅ DONE (PR1: 2e1b947, 2026-05-26)

`streamOllamaMessages()` and `streamAnthropicMessages()` in `modelProvider.js`. `chat-stream/route.js` shrunk 329 → 87 lines.

### ~~Add per-session message limit to v2 sessions~~ ✅ DONE (e28b527, 2026-05-26)

`MAX_SESSION_MESSAGES` (default 500) cap inside `normalizeSession` in `chats/route.js`. Configurable via env. Trims oldest first.

### ~~Add archived session pruning to prevent chats.local.json growth~~ ✅ DONE (e28b527, 2026-05-26)

`pruneSessions()` called from `writeChatFile()`. Keeps 50 most-recent archived, drops archived older than 90 days. Both via env (`MAX_ARCHIVED_SESSIONS`, `MAX_ARCHIVED_DAYS`). Active sessions never pruned.

### ~~Ollama startup health check~~ ✅ DONE (e28b527, 2026-05-26)

`/api/ollama-health` route + banner in MTGAssistant. 3s timeout. Three states (ok / server-down / model-missing). Two paths to clear: "Use Anthropic instead" one-click, or × dismiss. Banner auto-clears on recovery.

### ~~SessionSidebar polish — current agent first / clear input / hide empty groups~~ ✅ DONE (afc1948, 2026-05-26)

Three QA-discovered polish items closed before merge.

### ~~In-app feedback capture~~ ✅ DONE (d4b036d, 2026-05-26)

Phase 4 end-of-pass per CLAUDE.md. Floating button + modal with compose + inbox views. POST/GET `/api/feedback` writes JSON files to `data/feedback/`. Tests cover validation, sanitisation, ENOSPC, atomic-write, GET listing.

### ~~Phase 5 Garfield improvements~~ ✅ DONE (c3b01f0 + 958577f, 2026-05-26)

Goldfish v2: London mulligan, type_line/keywords-driven classification, archetype detection (aggro/control/combo/ramp/voltron/tokens/aristocrats/midrange), archetype-aware play priorities, game records to `data/games/`, insights summariser, GarfieldPanel pacing bars + signals, Karn/Tibalt/Jace receive history insights in their system prompt.

### ~~npm run backup~~ ✅ DONE (958577f, 2026-05-26)

`scripts/backup-data.cjs` copies decks + chats + agent-notes + feedback/ + games/ into `data/backups/{ts}/` with MANIFEST. Keeps 20 most-recent.

### ~~Phase 6 design doc~~ ✅ DONE (ab4cdae, 2026-05-26)

`docs/phase6-learn-to-play.md` — full design with curriculum specs, architecture sketch, data shapes, 10-PR build sequence, open questions, success criteria.

### ~~Remove v1 backward-compat shim~~ ✅ DONE (master, 2026-05-26)

`saveChatFile` and `scheduleChatFileSave` removed from `chatPersistence.js`. POST handler in `chats/route.js` now rejects `{ histories, locks }` with 400 instead of converting it. Tests updated; net 81/81 still passing.

### ~~Phase 6 PR1: gameState + zone helpers + tests~~ ✅ DONE (master, 2026-05-26)

`app/src/lib/learn/gameState.js` (~450 LOC) + `gameState.test.js` (56 tests). Pure immutable data layer per design doc §4. Factories for game/player/permanent/stack-object, zone transitions with battlefield-permanent wrapping/unwrapping, per-permanent tap/counter/attachment helpers, mana pool, life and commander damage, turn-counter resets, append-only event log. All helpers return new state — verified by immutability spot checks.
