# MTG Tool — TODOS

Items deferred from Phase 1 sprint reviews. Ordered by priority.

---

## P2

### ~~Wire Arbiter to Ollama~~ ✅ DONE (568554a, 2026-05-24)

`/api/arbiter/route.js` now calls `callModelMessages(payload)` where `payload.provider` comes from the client. Arbiter routes to Ollama when Local mode is active. No action needed.

---

### Ollama startup health check

**What:** On app load, ping `localhost:11434/api/tags` to verify Ollama is running and the configured model is pulled. Show a one-time banner if not ready: "Ollama not running — start with: `ollama serve`" or "Model not found — run: `ollama pull qwen2.5:32b`".

**Why:** Without this, the first rules question in a new session hangs or returns a confusing error. The actionable error messages in `callOllamaMessages` handle the failure case reactively — this handles it proactively on load.

**How to apply:** Add a startup `useEffect` in `MTGAssistant.jsx` (or `page.jsx`). Hit `localhost:11434/api/tags` directly (or a new `/api/ollama-health` route that proxies it). Display inline banner in the chat area, auto-dismiss after Ollama comes online.

**Depends on:** Day 1-2 Ollama wiring complete. ✅

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

### Pre-build oracle name index for faster cold starts

**What:** A build script (`npm run build:oracle-index`) that reads `oracle_cards.json` (165MB) and writes a pre-computed name→card lookup table to `data/scryfall-bulk/oracle-index.json`. The `/api/cards` route loads the index file on cold start instead of parsing 165MB of JSON.

**Why:** Parsing 165MB on every dev server restart takes ~3-5 seconds. The in-memory cache (`oracleCache`) persists for the server process lifetime but resets on restart. During active development, restarts are frequent and the cold-start delay is noticeable.

**How to apply:** Add `scripts/build-oracle-index.js`. Add `"build:oracle-index": "node scripts/build-oracle-index.js"` to `app/package.json`. Run it once after Day 3 bulk wiring. The index format: `{ "name_normalized": { card object } }`. `/api/cards` prefers the index file if present, falls back to raw parse.

**Depends on:** Day 3 bulk oracle wiring complete. ✅

---

### Extract streaming logic to modelProvider.js

**What:** `/api/chat-stream/route.js` (added in T5, commit 1cc354f) contains inline streaming implementations for both Ollama (NDJSON) and Anthropic (SSE). Meanwhile, `modelProvider.js` still has the non-streaming `callOllamaMessages` and `callAnthropicMessages` used by `/api/arbiter`. Duplicated Ollama URL, model resolution, auth header, and error message logic across both.

**Why:** Right now if you change OLLAMA_BASE_URL handling in modelProvider.js, you have to remember to also change it in chat-stream/route.js. Cold path for bugs.

**How to apply:** Add `streamOllamaMessages()` and `streamAnthropicMessages()` to `modelProvider.js` that return a Web `ReadableStream` of normalized SSE events. The chat-stream route becomes ~30 lines (just pick provider, return stream). Arbiter can stay non-streaming since it's silent.

**Depends on:** Nothing. P3 refactor.

---

### ~~Remove dead /api/anthropic route~~ ✅ DONE (feat/phase3-cleanup, 2026-05-26)

Deleted `app/src/app/api/anthropic/route.js` — was a 19-line pass-through to `callModelMessages`, not called anywhere.

---

### ~~Consolidate duplicate oracle caches~~ ✅ DONE (Phase 2 — cardIndex.js refactor)

Both `cards/route.js` and `cardContext.js` already delegate to `cardIndex.js` singleton. No separate caches exist.

---

### Promote current agent's session group to the top of SessionSidebar

**What:** In `SessionSidebar.jsx`, sort the `grouped` array so the current agent's group renders first instead of using the static `AGENTS` dict order (Jace, Karn, Tibalt).

**Why:** When the user is on Karn, they see the JACE group on top. Their own sessions are below sessions for agents they aren't looking at.

**How to apply:** After the `agentKeys.map(...)`, sort: place the entry where `key === agent` first, then preserve the original order for the rest.

**Source:** ISSUE-001 from `/qa` run on 2026-05-26.

**Files:** `app/src/components/mtg/SessionSidebar.jsx:53-66`

---

### Clear input or move input state per-session in useChatSessions

**What:** Either clear `input` when the active agent changes, or store `input` per session (e.g. inside the session object as `draftInput`).

**Why:** Typed-but-unsent text bleeds across agent switches. If a user types a question on Karn then clicks Jace, the same text is still in the input box waiting to be sent to Jace. Pre-existing behavior from the v1 hook, but more visible now that session switching is more frequent.

**How to apply:** Simplest fix is `useEffect` on `agent` that resets `input` to `""`. Cleaner fix is storing `draftInput` on the session object so per-session drafts persist.

**Source:** ISSUE-002 from `/qa` run on 2026-05-26.

**Files:** `app/src/hooks/useChatSessions.js:91`

---

### Hide empty AGENT (0) group header in SessionSidebar

**What:** Don't render the `JACE (0)` / `KARN (0)` group header when the current agent has 0 sessions — the "+ New chat with <agent>" button right above already communicates the empty state.

**Why:** Cosmetic redundancy when an agent has no sessions yet.

**How to apply:** In `SessionSidebar.jsx`, skip the group header `<div>` when `group.sessions.length === 0`. The button above remains.

**Source:** ISSUE-003 from `/qa` run on 2026-05-26.

**Files:** `app/src/components/mtg/SessionSidebar.jsx:99-110`
