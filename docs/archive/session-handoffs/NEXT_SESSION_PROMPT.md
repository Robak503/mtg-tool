# MTG Tool — Next-Session Resume Prompt

Generated 2026-05-26 (late) at master `128a860`.

Paste the block below into a fresh Claude Code session in the MTG-TOOL
project. Everything Claude needs to pick up where the previous session
left off is captured in the repo — this prompt just points at the right
files and sets the priority for the first move.

---

## Paste this into your next chat

```
You're picking up work on the MTG Tool — a local-first multi-agent
Magic: The Gathering Commander assistant. I'm the owner (Colton).
I'm a vibe-coder. You build, I direct.

The previous session shipped a lot. Before you do anything else, read:

1. `CLAUDE.md` — the project's operating manual (prime directives,
   architecture, forbidden patterns, agent specs).
2. `ROADMAP.md` — current build state. The "Late-2026-05-26 Addendum"
   at the top documents what shipped most recently.
3. `TODOS.md` — open queue sorted by priority. The Completed section
   at the bottom shows what's done.
4. `docs/phase6-learn-to-play.md` — design doc for the major in-flight
   build (Learn-to-Play mode). PR1–PR6 done; PR7–PR10 queued.

Quick state snapshot (verify by running these — don't trust me):
- `git log --oneline -10` should show master at 128a860 or later,
  with the most recent commits being Phase 6 work.
- `cd app && npm test` should show 316/316 passing across 19 files.
- `cd app && npm run build` should be clean.

Project structure that matters for picking up:
- `app/src/lib/learn/` — the Phase 6 engine modules (pure logic,
  316 tests cover this layer).
- `app/src/app/api/learn/start` + `app/src/app/api/learn/step` —
  HTTP boundary over the engine.
- `app/src/hooks/useLearnSession.js` + `app/src/components/mtg/LearnView.jsx`
  — the client-side UI.
- The Learn-to-Play feature is accessible from the dev server: click
  "Garfield" in the left Sidebar, pick decks + difficulty, play.

Anthropic API call count must stay at 0 by default. All chat goes to
local Ollama (qwen2.5:32b / qwen2.5:14b / qwen2.5:7b). The API is
opt-in only via the header toggle. This is a hard rule per CLAUDE.md.

WHAT TO DO FIRST:

The P0 item in TODOS.md is "Set up GitHub remote for the project."
Right now every commit lives on one SSD. Phase 6 (5000+ LOC) would
vanish if the laptop dies. Every gstack skill (/ship, /land-and-
deploy, /canary, /review) assumes a remote — without one we keep
inventing workarounds.

Walk me through:
1. Creating a private GitHub repo at github.com/new
2. Installing the gh CLI (winget install GitHub.cli on Windows, or
   use a personal access token)
3. git remote add origin <url>
4. git push -u origin master
5. git push origin feat/phase3-cleanup feat/phase2-arbiter-retrieval
   (push existing branches for history too)

Estimated time: 5–10 minutes including account creation if needed.

AFTER THE REMOTE IS UP:

Next valuable move is Phase 6 PR7 — Intermediate difficulty
refinements per `docs/phase6-learn-to-play.md` §5 step 7. The
decisionGate's Intermediate path is currently a stub (auto-picks
lands, auto-passes empty windows, asks on casts). PR7 makes it
actually feel like a coach — auto-pick chump blocks, surface trap
warnings before user attacks into open mana.

Don't start PR7 until the remote is up — running it on the existing
branch without a remote means we can't `/ship` it.

Other open items (TODOS.md P2–P4):
- PR8 — Expert mode + post-game analysis from decisionLog
- PR9 — Disk persistence for learn sessions
- PR10 — UI polish (zone graphics, keyboard shortcuts, mobile, a11y)
- Component tests for FeedbackButton / GarfieldPanel / SessionSidebar

Working tree note: the previous session left
`app/src/components/mtg/ChatPanel.jsx` and `app/package-lock.json`
with uncommitted changes. They were the user's parallel edits during
the long session, not Claude's. Run `git status` and `git diff` —
commit if intentional, revert if not.

If something in CLAUDE.md or this prompt contradicts what you see in
the actual code, the code wins. If you're unsure about scope, ask
me. If a fix fails twice, stop and use /investigate.

Go.
```

---

## Notes for future you (Colton)

This file lives at the repo root as `NEXT_SESSION_PROMPT.md`. You can
keep it there (so next-Claude reads it automatically when scanning the
project root) or delete it after using once.

If you want the prompt SHORTER, the minimum-viable version is:

> Resume work on this project. Read `CLAUDE.md`, `ROADMAP.md`, `TODOS.md`, and `docs/phase6-learn-to-play.md` first. Then handle the P0 item in TODOS.md (set up GitHub remote). After that, ask me what's next.

Either prompt works. The longer one front-loads the context that Claude
would otherwise have to discover via tool calls, so it's faster and
cheaper for the first turn.

---

## What this session shipped (for your reference)

In one continuous chat that started with PR0 (split useChatAgents.js)
and ended with PR6.4 (LearnView wired into MTGAssistant):

**Foundation refactor**
- PR0: split `useChatAgents.js` → `useChatSessions.js` + three lib modules
- PR1: v2 session schema, atomic writes, slim oracle index, streaming
  extraction to `modelProvider.js`, Vitest framework with 24 tests
- PR2: session manager UI (multi-session per agent, locked-deck snapshots)
- v1→v2 schema migration with `.v1.bak` backup

**Phase 4 end-of-pass + ops tooling**
- In-app feedback capture (floating button, modal, `/api/feedback`,
  FEEDBACK.md digest, popup window at `/feedback-window`,
  Cmd/Ctrl-Shift-F shortcut)
- Ollama startup health banner with one-click Anthropic fallback
- `MAX_SESSION_MESSAGES` + `pruneSessions()` to bound chats.local.json
- `npm run backup` script (snapshots `data/` to `data/backups/{ts}/`)
- README refresh, ROADMAP addendum
- `paths.js` helpers (`dataPath`, `mtgJudgePath`, `mtgEnginePath`)
  so a Tauri/Electron desktop binary can override roots

**Phase 5 — Goldfish v2**
- Archetype detection (aggro/control/combo/ramp/voltron/tokens/
  aristocrats/midrange)
- London mulligan + type_line/keywords classification + DFC handling
- Game records persisted to `data/games/`
- `gameInsights.js` summariser, `/api/games-summary`, GarfieldPanel
  with pacing bars
- Karn/Tibalt/Jace receive goldfish-history insights in their system
  prompt

**Phase 6 — Learn-to-Play (Beginner playable)**
- PR1 `gameState.js` (56 tests)
- PR2 `gameEngine.js` (29 tests)
- PR3 `legalChoices.js` (40 tests)
- PR4 `opponentAI.js` (15 tests)
- PR5 `decisionGate.js` + `narrator.js` (27 tests)
- Integration smoke (5 tests)
- PR6.1 `actionDispatcher.js` (20 tests)
- PR6.2 `learnSession.js` (18 tests)
- PR6.3 `/api/learn/start` + `/step` + in-memory store (19 tests)
- PR6.4 `useLearnSession` hook + `LearnView.jsx` (UI)
- Garfield Sidebar entry + MTGAssistant routing

**End state:** 316 Vitest cases across 19 files, all passing.
Build clean. Master at `128a860`. Anthropic call count: 0 by default.
