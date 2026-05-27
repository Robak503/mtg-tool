# MTG Tool Roadmap

## Current Addendum — 2026-05-26 (late)

Phases 1-5 plus the Phase 4 end-of-pass feedback capture are shipped on
`master`. Everything below is one continuous local trunk; the project has
no GitHub remote yet (queued as P0 in TODOS.md).

**Shipped this session (~17 commits on master):**
- PR0 `7c53f4d` — split `useChatAgents.js` into focused lib modules
- PR1 `2e1b947` — v2 session schema + atomic write + slim oracle index +
  streaming extraction to `modelProvider.js` + Vitest framework (24 tests)
- PR2 `d05c7f5` — session manager UI (`useChatSessions`, `SessionSidebar`,
  multi-session per agent, per-session locked-deck snapshots)
- `afc1948` — three SessionSidebar polish fixes from /qa
- `e28b527` — `MAX_SESSION_MESSAGES=500` + `pruneSessions()` + Ollama
  startup health check banner
- `d4b036d` — in-app feedback capture (Phase 4 end-of-pass per CLAUDE.md)
- `c3b01f0` — Phase 5 goldfish v2: London mulligan, type_line/keywords-
  driven classification, archetype detection (aggro/control/combo/ramp/
  voltron/tokens/aristocrats/midrange), archetype-aware play priorities,
  game records persisted to `data/games/`
- This commit — `gameInsights.js` summariser, `/api/games-summary` route,
  GarfieldPanel archetype badge + pacing bars + signal banners, Karn/
  Tibalt/Jace receive goldfish-history insights in their system prompt,
  `npm run backup` snapshots local data

**Test suite:** 81 Vitest cases across 9 files; full `npm test` clean.

---

## Late-2026-05-26 Addendum — Phase 6 PR1-PR6 + paths/Tauri refactor

Phase 6 (Learn-to-Play) is now end-to-end playable in Beginner mode.
Sub-PRs landed across several commits on master:

- **PR1** `gameState.js` — pure immutable data layer (factories, zones,
  permanents, mana, life). 56 tests.
- **PR2** `gameEngine.js` — turn/phase/step state machine with priority
  loop + trigger queue + APNAP ordering. 29 tests.
- **PR3** `legalChoices.js` — mana cost parser + can-afford + legal-
  action enumeration (pass / play-land / cast-spell / declare-attacker /
  declare-blocker). 40 tests.
- **PR4** `opponentAI.js` — archetype-aware action picker reusing
  goldfish v2 internals. 15 tests.
- **PR5** `decisionGate.js` + `narrator.js` — bridge between engine and
  player decisions, Jace-voice rule-citing narration per difficulty.
  27 tests.
- **Integration smoke** — 5-case end-to-end test driving the full
  stack through 2+ turn cycles.
- **PR6.1** `actionDispatcher.js` — pure-function "apply legal action
  to state" with default type-aware spell resolver. 20 tests.
- **PR6.2** `learnSession.js` — session lifecycle container with
  `advanceUntilDecision` driver loop. 18 tests.
- **PR6.3** `/api/learn/start` + `/api/learn/step` + in-memory session
  store. 19 tests.
- **PR6.4** `useLearnSession` hook + `LearnView.jsx` — minimal but
  functional React UI. Garfield entry in the Sidebar wires the user in.

Also during this stretch: paths refactor (`lib/server/paths.js`)
centralises `dataPath` / `mtgJudgePath` / `mtgEnginePath` so an
Electron / Tauri desktop binary can override roots without touching
route code. Feedback workflow expanded with a popup window
(`/feedback-window`), Cmd/Ctrl-Shift-F shortcut, FEEDBACK.md digest
generation, copy/download/delete actions. Tauri scaffolding under
`app/src-tauri/`.

**Test suite:** 316 Vitest cases across 19 files; `npm test` clean.

**Open queue (TODOS.md):** Phase 6 PR7 (Intermediate refinements),
PR8 (Expert + post-game analysis), PR9 (disk persistence for resume),
PR10 (UI polish — zone graphics, keyboard shortcuts, mobile, a11y).
P0 GitHub remote setup still queued.

This is the working roadmap. Claude Code updates this as phases complete.

## Status: Phase 0 — Initial Setup

Awaiting first Claude Code session. Audit document (`AUDIT.md`) will be produced on first run.

---

## Phase 1 — Foundation ✅ COMPLETE

- [x] Read CLAUDE.md and existing docs
- [x] Verify Node, git, gstack, GBrain are installed and functional
- [x] Delete `node_modules/` and `.next/` from working copy
- [x] `git init` and create `.gitignore`
- [x] Initial commit
- [x] `npm install`
- [x] Verify dev server boots
- [x] Produce `AUDIT.md` covering current state
- [x] Execute Phase 1 critical fixes (deck context lock, Ollama wiring, provider routing, cost telemetry)

---

## Phase 2 — Unified Knowledge Layer ✅ COMPLETE (feat/phase2-arbiter-retrieval, 37 commits)

- [x] Wire mtg-judge codex into runtime retrieval
  - [x] `rulesRetrieval.js` — keyword scoring retrieval with pinned hints and confidence levels
  - [x] Expose codex to Jace/Karn/Tibalt via Arbiter
- [x] Rebuild Arbiter as a real service
  - [x] `citationInjector.js` — builds grounding context, strips hallucinated citations
  - [x] Returns structured STATE/RESOLUTION/RULE TRACE/CITATIONS output
  - [x] Uses local Ollama; Anthropic call leak fixed (provider pinned to "ollama")
- [x] Centralized local card index (`cardIndex.js`) with singleton cache
- [x] RulesGuru precedent retrieval — scores scenarios against 200+ verified question corpus
- [x] Commander Spellbook local integration (`spellbook.js`) — combo lookup, bracket estimation
- [x] EDHREC salt grounding — local salt scores synced, used in power context
- [x] Deck power ranker (`powerRanker.js`) — deterministic 1–10 with CRISPI axes, bracket 1–5
- [x] Karn archetype blueprints — Combo, Control, Aggro/Midrange construction frameworks
- [x] Model tier selector UI — Fast/Mid/Deep/API tier in header
- [x] Ollama startup health check — banner if Ollama down or model not pulled

**Deferred to future phases (not Phase 2 scope):**
- [ ] Sync remaining Scryfall bulk datasets (default-cards, all-cards, artwork, rulings indexes)
- [ ] RulesGuru full API import (current: 200+ hand-verified questions via local file)
- [ ] Forge integration (deprioritized — limited value vs. effort)
- [ ] Addendums section in mtg-judge codex (nice-to-have, not blocking)

---

## Phase 3 — Ollama Integration (mostly done in Phase 2)

Stop bleeding API credits.

- [x] Install Ollama (verified on Windows)
- [x] Pull primary model (`qwen2.5:32b` deep, `qwen2.5:14b` mid, `qwen2.5:7b` fast)
- [x] Add Ollama as a provider in the chat infrastructure
  - [x] Provider abstraction in `modelProvider.js` and `chat-stream/route.js`
  - [x] Ollama NDJSON streaming adapter
  - [x] Actionable error messages when Ollama is unavailable or model not pulled
- [x] Default routing: Ollama for all agents
- [x] Arbiter pinned to Ollama — can never call Anthropic regardless of UI tier setting
- [x] Model tier selector UI — Fast / Mid / Deep / API tiers
  - [x] Karn and Tibalt always route to mid-tier (14B) for reasoning quality
  - [x] Fast/Deep for Jace respects tier selector
- [x] Ollama startup health check — banner on model-not-running or model-not-pulled
- [x] Cost telemetry V0 — `data/model-calls.local.json`, header badge (Local N | API N)

**Remaining P3 items (now tracked in TODOS.md):**
- [ ] Rename `/api/anthropic` → `/api/chat` (TODOS P3)
- [ ] Remove dead `/api/anthropic` route (TODOS P3)
- [ ] Extract streaming logic to `modelProvider.js` (TODOS P3)
- [ ] Consolidate duplicate oracle caches (TODOS P3)
- [ ] Full cost dashboard UI with dollar estimates and daily rollups

---

## Phase 4 — Agent Rewiring + UI Improvements

Fix the things the previous AI half-built.

- [ ] Karn → Arbiter → unified knowledge layer (Karn can finally see Scryfall data)
  - [x] V0 local Scryfall deck Oracle attachment
  - [x] V0 local Scryfall rulings attachment for locked decks
  - [x] V0 local Scryfall search candidate context for Karn
  - [x] V0 source receipt for locked-deck card data
  - [ ] Route through final KnowledgeService/Arbiter abstraction
- [ ] Jace → Arbiter wrapping (Jace silently calls Arbiter for rules-sensitive questions)
- [ ] Tibalt → Arbiter → unified knowledge layer (rules-aware roasts)
- [ ] Deck context hard lock per conversation
  - [x] V0 per-agent lock snapshot for Jace/Karn/Tibalt/Arbiter
  - [x] Locked deck triggers local Oracle/rulings context attachment
  - [x] Locked deck triggers local engine/rules fringe-context retrieval
  - [x] Unlock Deck and Unload Deck controls
  - [ ] Full chat session manager with multiple active/archived conversations
- [ ] Chat session manager UI
  - [ ] List of active chats grouped by agent
  - [ ] Show locked deck per chat
  - [ ] "New chat" button (select agent + deck context)
  - [ ] "Close/archive chat" button
  - [ ] Easy switching between active chats
- [ ] "View Arbiter Trace" toggle for Jace's rules answers
- [ ] In-app feedback capture system (so real usage feeds back into priorities)

---

## Phase 5 — Garfield Goldfish Improvements

Better simulation, smarter play.

- [ ] Smarter mulligan logic per archetype
- [ ] Commander-specific play priorities (voltron, combo, control, aristocrats, etc.)
- [ ] Better card classification using full Scryfall data
- [ ] Save game records to `data/games/`
- [ ] Trend analysis across multiple games per deck
- [ ] Surface insights ("this deck floods 30% of the time")

---

## Phase 6 — Learn-to-Play Mode

Major separate roadmap. Do not start until Phases 1-5 are solid.

- [ ] Design doc for the curriculum (what knowledge at which level)
- [ ] Game state model (battlefield, hand, stack, graveyard, exile, command, library)
- [ ] Legal action generator
- [ ] Opponent profiles (deck personalities to play against)
- [ ] Beginner mode (explain every step)
- [ ] Intermediate mode (explain key decisions)
- [ ] Expert mode (play at speed, explain mistakes)
- [ ] Saved learning sessions and progress tracking
- [ ] Integration with Arbiter for rule accuracy
- [ ] Integration with Jace voice for explanations

---

## Phase 7+ — Continuous Improvement

- [ ] In-app feedback review and prioritization
- [ ] Codex (mtg-judge) addendums for clarifications as they come up
- [ ] Cost reduction (less Anthropic, more local)
- [ ] Performance optimization (Scryfall indexes, query caching)
- [ ] Mac mini migration when ready
- [ ] Consider server option (Weaviate / Qdrant / Supabase) if local outgrows the laptop

---

## Decisions Log

Significant architectural decisions get logged here as they're made.

- 2026-05-23: Deck context is now split into two UX concepts: **loaded deck** (sidebar selection) and **locked deck** (immutable per-agent conversation snapshot). `Unlock` removes the current agent's snapshot while keeping chat history. `Unload` clears the sidebar deck selection. A locked deck triggers local Scryfall Oracle text attachment for the deck's non-token cards.
- 2026-05-23: Local Scryfall is the source of truth for normal chat card data. The owner will update local Scryfall data when cards change. Karn now receives local Scryfall search candidate pools for deck-building prompts, but model generation is still Anthropic until Ollama/provider routing is implemented.
- 2026-05-23: Locked deck context now attaches a local-first fact bundle: Oracle text, local rulings capped per card, source receipt, and local `/api/engine` rules/fringe context. Live Scryfall fallback is allowed only for missing card facts, not normal search.
- 2026-05-23: ModelProvider V0 added. `/api/anthropic` remains backward-compatible but can route to Ollama via provider settings. `/api/arbiter` now uses the same provider layer. Automatic paid fallback is off by default; Ollama failures return a visible error instead of silently spending Anthropic credits.
- 2026-05-23: Provider/cost telemetry V0 added at `app/data/model-calls.local.json`. It logs provider/model/status/count metadata only, not prompt text, and is ignored by git.
- 2026-05-23: Provider status is now visible in the app header as `Local N | API N`, fed by `GET /api/model-calls`.
- 2026-05-23: Manual Local/API provider switch added to the app header. Chat messages and silent Arbiter trace calls pass the selected provider. The choice is saved in browser local storage as `mtg-model-provider`.
- 2026-05-23: Provider default is now Local/Ollama for cost safety. Anthropic is only used when the user selects `API` or explicitly configures the provider to `anthropic`.
- 2026-05-24: Ollama installed and verified on Windows. `qwen2.5:14b` is pulled, configured as the app default, and verified through `/api/anthropic` and `/api/arbiter`. Ollama context default raised to 32K for locked-deck Oracle/rulings prompts.
- 2026-05-24: `/api/arbiter` now auto-attaches local Scryfall Oracle/rulings context for card names in direct Arbiter questions when the caller did not already provide a card context block. This fixes direct local-model rules calls that mention cards outside the chat UI's client-side context builder.
- 2026-05-23: The canonical project is `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL`. The older Codex project may still run on port 3000; use `http://localhost:3001` for the canonical project when port 3000 is occupied.
- 2026-05-25: Arbiter's `provider` field was being passed unvalidated from request body to `callModelMessages`. This caused every rules question to hit the Anthropic API when user had "API" tier selected. Fixed by hardcoding `provider: "ollama"` in Arbiter's payload — Arbiter is local-only by design.
- 2026-05-25: `spellbook.js` singleton `_loadAttempted` flag restructured: previously set before file existence check (permanent miss), now only set after confirming files exist. Users can run `npm run sync:spellbook` without restarting the dev server to load combo data.
- 2026-05-25: Deck power ranker uses Commander Spellbook combo data for bracket estimation and EDHREC salt scores for "salt context". Scores are cached per deck hash with 24-hour TTL to avoid recomputing on every Karn/Tibalt message.
- 2026-05-25: Phase 2 /review gstack pass completed. 7 total fixes applied (4 main pass + 3 adversarial). Branch is clean and ready to merge.

---

## Known Limitations / Future Investigations

- RulesGuru API limits (TBD — Claude Code investigates Phase 2)
- Reach out to RulesGuru for a bulk dump request (low priority, if API insufficient)
- Forge integration depth (TBD — Claude Code investigates Phase 2)
- Move from PGLite to Supabase when transitioning to Mac mini
- Server option for if/when local data outgrows the laptop
