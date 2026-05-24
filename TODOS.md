# MTG Tool — TODOS

Items deferred from Phase 1 CEO review (2026-05-23). Ordered by priority.

---

## P2

### Wire Arbiter to Ollama

**What:** Route `/api/arbiter` through Ollama (using the Arbiter prompt) instead of hardcoding Anthropic.

**Why:** Currently, even with the global provider set to Local, Jace silently calls `/api/arbiter` which hits Anthropic. This means "Local = $0" is false for any rules-sensitive Jace question. Until this is done, Local mode skips Arbiter entirely.

**How to apply:** After Day 1-2 Ollama wiring is complete, add Ollama as a provider option in `/api/arbiter/route.js`. Use the same provider-toggle pattern as the main chat. The Arbiter prompt is in `app/src/lib/agents.js` as `ARBITER_PROMPT`. Phase 2 goal is to replace the thin proxy with a real retrieval service — this TODO is the intermediate step.

**Depends on:** Day 1-2 Ollama wiring complete.

---

### Ollama startup health check

**What:** On app load, ping `localhost:11434/api/tags` to verify Ollama is running and the configured model is pulled. Show a one-time banner if not ready: "Ollama not running — start with: `ollama serve`" or "Model not found — run: `ollama pull qwen2.5:32b`".

**Why:** Without this, the first rules question in a new session hangs or returns a confusing error. The actionable error messages in `/api/ollama` handle the failure case reactively — this handles it proactively on load.

**How to apply:** Add a startup effect in `app/src/app/page.js` or a top-level component. Call `/api/ollama` with a lightweight health-check request (or check `localhost:11434/api/tags` directly from a new `/api/ollama-health` route). Display inline banner, auto-dismiss after Ollama comes online.

**Depends on:** Day 1-2 Ollama wiring complete.

---

## P3

### Pre-build oracle name index for faster cold starts

**What:** A build script (`npm run build:oracle-index`) that reads `oracle_cards.json` (165MB) and writes a pre-computed name→card lookup table to `data/scryfall-bulk/oracle-index.json`. The `/api/cards` route loads the index file on cold start instead of parsing 165MB of JSON.

**Why:** Parsing 165MB on every dev server restart takes ~3-5 seconds. The in-memory cache (`oracleCache`) persists for the server process lifetime but resets on restart. During active development (Day 3 and after), restarts are frequent and the cold-start delay is noticeable.

**How to apply:** Add `scripts/build-oracle-index.ts` (or .js). Add `"build:oracle-index": "node scripts/build-oracle-index.js"` to `app/package.json`. Run it once after Day 3 bulk wiring. The index format: `{ "name_normalized": { card object } }`. Persist the JSON with `JSON.stringify`. `/api/cards` prefers the index file if present, falls back to raw parse.

**Depends on:** Day 3 bulk oracle wiring complete.
