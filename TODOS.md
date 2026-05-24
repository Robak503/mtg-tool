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

### Rename `/api/anthropic` to `/api/chat`

**What:** The `/api/anthropic` route now dispatches to both Ollama and Anthropic based on `provider` field. The name is misleading — calling it with `provider: "ollama"` routes to Ollama. Rename the route to `/api/chat` and update the single call site in `useChatAgents.js` line 486.

**Why:** The name will cause confusion in Phase 2 when the knowledge layer is built and more routes are added. "I'm calling /api/anthropic with provider=ollama" is confusing to read.

**How to apply:** Create `app/src/app/api/chat/route.js` that re-exports the handler from the current `anthropic/route.js`. Update `useChatAgents.js` line 486: `fetch("/api/anthropic"` → `fetch("/api/chat"`. Delete the old `anthropic/route.js`. One redirect approach or a simple move.

**Depends on:** Nothing.

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

### Remove dead /api/anthropic route

**What:** After T5, `/api/chat-stream` handles all chat traffic. `/api/anthropic` is no longer called from anywhere in the codebase (`grep -r "/api/anthropic" app/src` returns nothing).

**Why:** Dead route. Confuses future readers ("which one do I call?"). When P3 rename happens, this disappears anyway.

**How to apply:** Delete `app/src/app/api/anthropic/route.js`. Verify build still passes.

**Depends on:** Nothing.

---

### Consolidate duplicate oracle caches

**What:** `app/src/app/api/cards/route.js` and `app/src/lib/server/cardContext.js` each independently parse and cache `oracle_cards.json` and `rulings.json`. Two separate `oracleCache` variables in the same server process.

**Why:** After Day 3, both files load 165MB + 24MB independently on first request. ~900MB of duplicate parsed data in V8. With 32GB RAM this is tolerable but wasteful, and it doubles cold-start time if both routes are hit simultaneously.

**How to apply:** Extract oracle/rulings loading to `app/src/lib/server/oracleStore.js` with a single `loadOracle()` and `loadRulings()` export. Both `cards/route.js` and `cardContext.js` import from there. Single cache, single parse.

**Depends on:** Day 3 bulk oracle wiring complete. ✅
