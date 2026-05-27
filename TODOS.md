# MTG Tool — TODOS

Items deferred from Phase 1 sprint reviews. Ordered by priority.

---

## P2

### ~~Wire Arbiter to Ollama~~ ✅ DONE (568554a, 2026-05-24)

`/api/arbiter/route.js` now calls `callModelMessages(payload)` where `payload.provider` comes from the client. Arbiter routes to Ollama when Local mode is active. No action needed.

---

### ~~Ollama startup health check~~ ✅ DONE (master, 2026-05-26)

New `/api/ollama-health` route checks `${OLLAMA_BASE_URL}/api/tags` with a 3s timeout, compares the configured 3-tier model list against what Ollama has pulled. `MTGAssistant.jsx` polls on load + every 30s (skipped when modelProvider=anthropic) and renders a coloured banner with two paths to clear: "Use Anthropic instead" (one-click switch) or × dismiss. Banner auto-clears when health recovers.

---

## P3

### ~~Rename `/api/anthropic` to `/api/chat`~~ ✅ MOOT (2026-05-26)

Route deleted entirely — chat traffic was already on `/api/chat-stream`. The dead `/api/anthropic` wrapper is gone.

---

### Add per-session message limit to v2 sessions

**What:** Add `MAX_SESSION_MESSAGES = 500` constant to `writeChatFile()` in `app/src/app/api/chats/route.js`. When a session's `messages` array exceeds the limit, trim oldest first (`.slice(-MAX_SESSION_MESSAGES)`).

**Why:** v1's `normalizeHistories()` trimmed each agent history to 200 messages (line 22: `.slice(-200)`). That function becomes dead code in v2. Without an equivalent guard, long-running sessions grow unboundedly.

**How to apply:** Add the constant and a one-line trim inside `writeChatFile()` alongside the existing `normalizeMessage()` call. Also add to the `MAX_SESSION_MESSAGES` constant export for tests.

**Depends on:** PR1 (v2 schema migration in `chats/route.js`). Slot into the same writeChatFile() rewrite — 10 minutes of work.

---

### Add archived session pruning to prevent chats.local.json growth

**What:** Add a `pruneSessions(sessions)` function called from `writeChatFile()`. Keeps the latest N archived sessions and removes those older than D days. Suggested defaults: keep last 50 archived, prune archived older than 90 days. Both limits configurable via env vars (`MAX_ARCHIVED_SESSIONS`, `MAX_ARCHIVED_DAYS`).

**Why:** Full `lockedDeck` snapshots (~80-120KB per session with oracle text) accumulate with no current pruning. At 3 sessions/week, `chats.local.json` reaches 12MB in a year — slow JSON parse, wasted disk. Active sessions (not archived) are never pruned.

**How to apply:** New `pruneSessions(sessions)` function in `app/src/app/api/chats/route.js`. Called before the JSON write in `writeChatFile()`. Separate function to keep `writeChatFile()` readable.

**Depends on:** PR1 (v2 schema migration). Slot into PR1 or a follow-up cleanup PR.

---

### ~~Pre-build oracle name index for faster cold starts~~ ✅ DONE (PR1: 2e1b947, 2026-05-26)

`scripts/build-oracle-index.cjs` + `npm run build:oracle-index`. `cardIndex.js` prefers `oracle-index.json` when present. 165MB → 29MB, ~3-5s cold start → ~200ms.

---

### ~~Extract streaming logic to modelProvider.js~~ ✅ DONE (PR1: 2e1b947, 2026-05-26)

`streamOllamaMessages()` and `streamAnthropicMessages()` live in `modelProvider.js`. `chat-stream/route.js` shrunk 329 → 87 lines. All 12 DRY violations removed.

---

### ~~Remove dead /api/anthropic route~~ ✅ DONE (feat/phase3-cleanup, 2026-05-26)

Deleted `app/src/app/api/anthropic/route.js` — was a 19-line pass-through to `callModelMessages`, not called anywhere.

---

### ~~Consolidate duplicate oracle caches~~ ✅ DONE (Phase 2 — cardIndex.js refactor)

Both `cards/route.js` and `cardContext.js` already delegate to `cardIndex.js` singleton. No separate caches exist.

---

### ~~Promote current agent's session group to the top of SessionSidebar~~ ✅ DONE (PR2 polish, 2026-05-26)

ISSUE-001 fixed inline before opening the PR. `SessionSidebar.jsx` now builds `ordered = [agent, ...others]` before mapping into groups.

---

### ~~Clear input or move input state per-session in useChatSessions~~ ✅ DONE (PR2 polish, 2026-05-26)

ISSUE-002 fixed inline. Added `useEffect(() => setInput(""), [agent])` in `useChatSessions.js` so typed drafts don't bleed across agent switches.

---

### ~~Hide empty AGENT (0) group header in SessionSidebar~~ ✅ DONE (PR2 polish, 2026-05-26)

ISSUE-003 fixed inline. Group filter changed from `sessions.length > 0 || key === agent` to `sessions.length > 0`, so empty agent groups never render. The "+ New chat with <agent>" button above already communicates the empty state.
