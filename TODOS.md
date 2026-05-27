# MTG Tool — TODOS

Grouped by skill/component, then priority (P0 at top, P4 at bottom).
Completed items live in the `## Completed` section so the open queue
stays readable.

---

## Infra / Workflow

### P1 — Tauri production .exe follow-ups

**What:** Three small follow-ups to the Tauri shell that landed 2026-05-26:

1. **Refactor `knowledge-status/route.js` to use `paths.js`** — currently uses raw `process.cwd()` joins to find scryfall-bulk and mtg-judge data. In production the cwd is the bundled standalone server dir, not the dev tree, so the route reports things as "missing" that actually live in resources/ or %APPDATA%. Wire it through `dataPath()` / `mtgJudgePath()` and the status banner will be accurate from the .exe.

2. **First-launch data wizard** — right now the .exe seeds %APPDATA%\com.colton.mtg-tool\data\ with only the slim oracle-index. The user's full deck library, chats, and bulk Scryfall data live in the dev tree. Add a one-shot UI prompt on first launch: "Import data from existing install?" with a folder picker defaulting to ...\MTG-TOOL\app\data\. Cleanest path to a usable cold-install.

3. **Auto-updater wiring** — Tauri v2 ships with `tauri-plugin-updater`. Once the GitHub remote exists (existing P0), add a GitHub Actions workflow that builds the NSIS installer on every `v*` tag and uploads as a release asset. Then wire `tauri-plugin-updater` in `lib.rs` to point at the releases feed. This is the "UI updates ship automatically" story from `docs/packaging-review.md`.

**Why:** The .exe boots and serves the app today, but these three rough edges block a clean handoff.

---

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

PR1-PR6 done (Beginner mode end-to-end playable). Open items for PR7+:

### P2 — Phase 6 PR7: Intermediate difficulty refinements

**What:** Refine `decisionGate` Intermediate path. Auto-pick blocks when there's a "must block this with the cheapest creature" pattern. Surface trap warnings ("opponent has untapped mana for a counter") before user attacks into open mana.

**Why:** PR5 shipped a stub Intermediate that auto-passes empty windows and asks on real casts. PR7 makes it actually feel like a coach.

**Reference:** `docs/phase6-learn-to-play.md` §3 (Intermediate curriculum) + §5 step 7.

---

### P2 — Phase 6 PR8: Expert mode + post-game analysis

**What:** Expert mode auto-decides everything via opponentAI policy and surfaces a post-game analysis that detects "you held mana for X but never cast it" / "you could have attacked for lethal on turn 7" patterns from the decisionLog.

**Why:** Expert is the "watch the engine run, learn from the post-mortem" mode — high value for advanced users.

**Reference:** `docs/phase6-learn-to-play.md` §3 (Expert curriculum) + §5 step 8.

---

### P3 — Phase 6 PR9: Disk persistence for learn sessions

**What:** Save learn sessions to `data/learn-sessions/{id}.json` so the user can resume across server restarts. Add a "Resume" entry in LearnView's idle screen listing recent sessions.

**Why:** Right now sessions live in process memory and vanish on restart. For a 30-minute Beginner game, that's annoying.

---

### P3 — Phase 6 PR10: UI polish

**What:** Zone graphics (cards in hand as proper rows, battlefield as a grid, stack as a vertical column). Keyboard shortcuts (1-9 to pick options, Enter for recommended). Mobile layout. Accessibility (focus management, ARIA labels on decision buttons).

**Why:** PR6.4 ships a "functional but spare" UI. PR10 makes it pleasant to use for long sessions.

---

## Persistence


## UI Polish

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

### ~~Phase 6 PR2: gameEngine state machine + tests~~ ✅ DONE (master, 2026-05-26)

`app/src/lib/learn/gameEngine.js` (~290 LOC) + `gameEngine.test.js` (29 tests). Turn-structure state machine on top of PR1. `advanceStep`/`runStepActions`/`nextStep` for phase/step walking with end-of-turn wrap-around; `passPriority` handles the priority loop with step-end-on-empty-stack and stack-resolution-on-non-empty; `resolveTopOfStack` runs `payload.onResolve` callbacks with error containment; trigger queue via `enqueueTrigger` + `flushTriggers` with APNAP ordering; `startGame` covers opening 7 + first-turn draw-skip per CR 103.7a. Untap and cleanup correctly skip the priority grant per CR 117.3a.

### ~~Phase 6 PR3: legalChoices generator + tests~~ ✅ DONE (master, 2026-05-26)

`app/src/lib/learn/legalChoices.js` (~280 LOC) + `legalChoices.test.js` (40 tests). Mana-cost parser (`parseManaCost`) handles generic/colored/colorless/X/hybrid/phyrexian pips; `canPayManaCost` checks pool affordability with hybrid resolution; `legalActionsForPlayer` surfaces pass-priority + play-land (sorcery-speed + own-turn + stack-empty + once-per-turn checks) + cast-spell (timing + cost-affordable) + declare-attacker (untapped, not summoning-sick unless Haste) + declare-blocker (untapped, defender-only, per-attacker pair). Activate-ability and oracle-text target parsing deferred per design doc.

### ~~Phase 6 PR4: opponentAI + tests~~ ✅ DONE (master, 2026-05-26)

`app/src/lib/learn/opponentAI.js` (~240 LOC) + `opponentAI.test.js` (15 tests). `pickAction` enforces priority order land→cast→pass; cast scoring matches the per-archetype priority tables from goldfish v2's internal `buildCastScorer` (aggro→cheap-creatures-first, control→interaction-first, combo→ramp-and-tutors, voltron→equipment, etc.). `pickAttackPlan` attacks with every legal attacker (v1 policy; bluffing/trap-detection is PR7+). `pickBlockPlan` assigns at most one blocker per attacker preferring smallest power. Archetype resolves lazily via `detectArchetype` over `deriveDeckRepresentation(state, playerId)` when the caller doesn't supply one.

### ~~Phase 6 PR5: decisionGate + narrator (Beginner) + tests~~ ✅ DONE (master, 2026-05-26)

`app/src/lib/learn/decisionGate.js` + `narrator.js` (~300 LOC combined) + `decisionGate.test.js` (27 tests). Bridge between engine and player decisions. Jace-voice templates per step with rule citations at Beginner; one-sentence summary at Intermediate; silent at Expert. `makeDecision` routes user side per difficulty (ask everything / auto-pick lands / silent autopilot) while AI side always auto-decides. `resolveChoice` validates the user's pick against legal options.

### ~~Phase 6 integration smoke test~~ ✅ DONE (master, 2026-05-26)

`app/src/lib/learn/integration.test.js` — 5 cases driving the full lib stack through 2+ turn cycles to prove PR1-PR5 compose without crashing.

### ~~Phase 6 PR6.1: actionDispatcher.js + tests~~ ✅ DONE (master, 2026-05-26)

`app/src/lib/learn/actionDispatcher.js` (~280 LOC) + 20 tests. Pure-function layer that takes a legal action and produces the next state. Handles pass-priority, play-land, cast-spell (with default type-aware resolver that puts creatures/artifacts/enchantments/planeswalkers on the battlefield and treats instants/sorceries as no-op-with-log), declare-attacker, declare-blocker. Mana-deduction arithmetic with hybrid handling and "spend C before colored" generic-cost preference.

### ~~Phase 6 PR6.2: learnSession.js + tests~~ ✅ DONE (master, 2026-05-26)

`app/src/lib/learn/learnSession.js` (~230 LOC) + 18 tests. Session lifecycle container wrapping GameState + difficulty + decisionLog + status. `advanceUntilDecision` driver loop auto-applies AI decisions and trivial user auto-passes until a real user decision OR game-end. `applyChoice` validates against legal options + dispatches + chains advanceUntilDecision so the UI gets the next prompt in one round-trip. Detects life ≤ 0 and commander damage ≥ 21 as state-based actions.

### ~~Phase 6 PR6.3: /api/learn/start + /api/learn/step + store + tests~~ ✅ DONE (master, 2026-05-26)

HTTP boundary: `POST /api/learn/start` creates a session and returns the first decision; `POST /api/learn/step` applies a choice. In-memory session store with 50-session cap + 4-hour TTL. Wire payload strips non-serialisable fields (e.g. `payload.onResolve` on stack objects). 19 tests cover input validation, store round-trip, game-end cleanup, dispatch-error vs 5xx mapping.

### ~~Phase 6 PR6.4: useLearnSession + LearnView UI~~ ✅ DONE (master, 2026-05-26)

`useLearnSession` hook over the HTTP routes plus `LearnView.jsx` (~350 LOC). Three screen states: idle (deck pickers + difficulty radio + Start), active (prompt + numbered options + recent-actions feed + abandon), ended (win/lose + new game). Wired into MTGAssistant as the `centerView==="learn"` branch; Sidebar gets a Garfield Learn-to-Play entry. Phase 6 is now end-to-end playable in the dev server.
