# PR Summary — feat/phase3-cleanup → master

**Local-only merge** (no GitHub remote configured). Branch contains 7 commits, +4,394 / -1,543 lines across 26 files.

## Why this PR exists

The chat UI was one large entangled hook (`useChatAgents`, 980 lines) backed by a flat v1 file format (`{ histories: { jace: [...], karn: [...], tibalt: [...] } }`) that only supported one conversation per agent. Switching between brewing Atraxa and roasting Edgar meant losing the previous chat. The session model in the project's `CLAUDE.md` calls for "a list of active chats, grouped by agent, each with a locked deck snapshot" — this PR ships that.

The branch is structured as three stacked sub-PRs so each one is reviewable in isolation:

```
PR0  refactor: split useChatAgents.js into focused utility modules
PR1  feat:     v2 session schema + atomic write + slim oracle index
                + streaming extraction + Vitest setup
PR2  feat:     session manager UI (useChatSessions, SessionSidebar,
                ChatPanel)
```

## Commits

```
afc1948  fix(qa): three SessionSidebar UX polish items from /qa run
ae4b189  chore(qa): log 3 SessionSidebar polish items + ignore migration backups
d05c7f5  feat(PR2): session manager UI with multi-session conversations per agent
2e1b947  feat(PR1): v2 session schema + atomic write + slim oracle index + streaming extraction + Vitest
7c53f4d  refactor(PR0): split useChatAgents.js into focused utility modules
0d913c3  docs(todos): add per-session message limit and archived session pruning TODOs
108b58a  refactor: Phase 3 cleanup — dead route, streaming fixes, DFC scoring
```

## What's in it, by file

### New (production)
- `app/src/hooks/useChatSessions.js` — replaces `useChatAgents.js`. Owns the sessions array, active-session-per-agent map (persisted to localStorage), and the send path that captures originSessionId so streamed tokens always land in the originating session even after the user switches sessions mid-stream.
- `app/src/components/mtg/SessionSidebar.jsx` — desktop session list. Per-agent groups (current agent first), per-session card with name (double-click to rename), 🔒 deck chip, last-message preview, relative timestamp, archive/unarchive button. Active/archived toggle at top.
- `app/src/lib/deckContextBuilder.js` — pure deck-context utilities extracted from useChatAgents (createDeckLock, lockContext, buildSavedDeckContext, engine-context predicates).
- `app/src/lib/arbiterUtils.js` — Arbiter fetch + metadata summarizer.
- `app/src/lib/chatPostProcess.js` — bracket card names, local Jace rules primer, context counters.
- `app/scripts/build-oracle-index.cjs` — `npm run build:oracle-index` builds a 29MB slim index from the 165MB oracle bulk file. Cold start drops from ~3-5s to ~200ms.

### New (tests)
- `app/vitest.config.js` + 4 test files. 24 tests passing.
  - `chats/route.test.js` — v1→v2 migration, SyntaxError recovery, atomic write tmpfile cleanup, ENOSPC → 507, v1 shim POST.
  - `chatPersistence.test.js` — beacon shape sessions vs histories, debounce coalesce, load shim.
  - `build-oracle-index.test.js` — happy path + missing-input error.
  - `cardIndex.test.js` — slim index path, fallback, normalize edges, ENOENT hint.

### Modified
- `app/src/app/api/chats/route.js` — v1→v2 migration on first read, atomic `.tmp + fs.rename` writes, `.v1.bak` backup, `.corrupted` preservation, backward-compat POST shim accepting both `{ sessions }` and `{ histories, locks }`.
- `app/src/app/api/chat-stream/route.js` — shrinks 329 → 87 lines after streaming logic moved into `modelProvider.js`.
- `app/src/lib/server/modelProvider.js` — adds `streamOllamaMessages` + `streamAnthropicMessages` + `appendStreamingCallLog`. Removed 12 DRY violations.
- `app/src/lib/server/cardIndex.js` — prefers slim index when present, falls back to full file. Sync by design (no race).
- `app/src/lib/chatPersistence.js` — v2 `saveSessions` + `scheduleChatSessionsSave`. Beacon writes whichever shape was scheduled.
- `app/src/components/MTGAssistant.jsx` — swaps hook, derives v1-shaped `histories` locally for DeckView, wires SessionSidebar between deck sidebar and chat center.
- `app/src/components/mtg/ChatPanel.jsx` — renders `currentSession.messages`, session header + "+ New chat" button, per-session lockedDeck banner.
- `app/package.json` — adds vitest dep, `build:oracle-index`, `test`, `test:watch` scripts.
- `.gitignore` — `app/data/*.bak` and `app/data/*.corrupted` (migration artifacts).
- `TODOS.md` — three polish items added and immediately resolved before this merge.

### Deleted
- `app/src/hooks/useChatAgents.js` — replaced by useChatSessions.
- `app/src/app/api/anthropic/route.js` — already dead, formally removed in Phase 3 cleanup.

## Behavior changes the user will see

1. **First load after merge:** existing `chats.local.json` (v1) is automatically migrated to v2. Each agent's history becomes one archived session named "Imported — <first 60 chars of first user message>". A `.v1.bak` is written next to the original.
2. **Three-column desktop layout:** Deck sidebar | Session sidebar | Chat | Right panel. Mobile is unchanged (SessionSidebar only renders on desktop — follow-up work).
3. **Per-agent multi-session:** "+ New chat with Karn" creates a new Karn session and locks the currently-active deck to it. Switching the active deck in the deck sidebar does NOT change the lock — that's the whole point.
4. **Archive instead of clear:** "Clear Chat" archives the current session and starts a fresh one. Old sessions remain accessible via the archived toggle.
5. **Local cold start ~200ms** for card lookups instead of ~3-5s, after running `npm run build:oracle-index` once.
6. **Cost dashboard unchanged.** Ollama still gets every chat request; Anthropic stays at 0 calls unless the user explicitly retries with the API button.

## Test plan (what was verified)

| Layer | How | Result |
|---|---|---|
| Build | `npm run build` after every commit | clean |
| Unit/integration | `npm test` (Vitest, 24 tests) | 24/24 pass |
| Oracle index script | `npm run build:oracle-index` on real 165MB bulk | 35,285 cards in 2s, 29MB output |
| Browser walkthrough | `/qa` against local dev server | health 92/100, 0 console errors, 0 functional bugs |
| Migration | Loaded with existing v1 `chats.local.json` | 3 archived sessions auto-created with correct names |
| Persistence | Reload page after creating sessions | full rehydration, activeSessionId restored from localStorage |
| Archive flow | Programmatic click + API verification | session moved to archived state on disk within 500ms |

Manual QA report: `.gstack/qa-reports/qa-report-localhost-2026-05-26.md`. Screenshots in `.gstack/qa-reports/screenshots/`.

## Known follow-ups (not blocking merge)

These live in `TODOS.md` as P2/P3 items, not in this PR:
- Ollama startup health check (banner if `ollama serve` not running)
- `MAX_SESSION_MESSAGES = 500` cap inside `writeChatFile()`
- `pruneSessions()` to keep `chats.local.json` from growing unboundedly
- Mobile UX for `SessionSidebar` (currently desktop-only)
- Tests for the session hook's origin-id capture and rename
- Full removal of the v1 shim in `chatPersistence.js` and `chats/route.js` POST handler once we're confident no stale tabs still send v1 payloads
