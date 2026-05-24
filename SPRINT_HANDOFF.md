# MTG Tool — Phase 1 Sprint Handoff
*Produced by Claude Code session 2026-05-24. Continuation guide for any AI assistant.*

---

## TL;DR for the next session

**The sprint is code-complete.** All 13 tasks shipped across 7 commits. `npm run build` passes clean. Only thing left is **T12 — manual smoke test against a running Ollama instance.**

Pull, restart, and verify. The 12-step Brewing Session Acceptance Test in T12 is the gate. If anything fails, it's almost certainly in one of the 10 risk points listed under "Known Risks / Smoke Test Notes" near the bottom.

If smoke test passes → sprint is done, move to Phase 2 (unified knowledge layer per `2026-05-23-master-design-phase1.md`).
If smoke test fails → use the risk notes, fix in place, do not start Phase 2.

**Latest commit**: 99839fd
**Branch**: master
**Total sprint commits**: 7 (76b733e, 9058277, 8ff51f5, 1cc354f, b81509a, dbd7a5f, 99839fd)

---

## Context Snapshot

This document is a cold-start handoff. Read it fully before touching any code.

**Project**: MTG Tool — local-first Commander assistant  
**Branch**: master  
**Session date**: 2026-05-24  
**Plan doc**: `C:\Users\colto\.gstack\projects\MTG-TOOL\2026-05-23-master-design-phase1.md`  
**Test plan**: `C:\Users\colto\.gstack\projects\MTG-TOOL\colton-master-eng-review-test-plan-20260524.md`

### What was reviewed and approved

Two planning teams reviewed this sprint:
- **Claude /autoplan** (CEO + Design + Eng + DX reviews)
- **Codex simulated reviews** (office hours, CEO, eng, pairwise, final table)

Both cleared it. Both teams agreed: *build the smallest local-first foundation that makes agents cheap, fact-grounded, and deck-locked; defer every data source or engine feature that does not directly serve that first trust loop.*

**The plan is APPROVED. Begin implementing at T1.**

---

## What's Already Built

### Commits to know about

**568554a** — The big one. Contains:
- `app/src/lib/server/modelProvider.js` (new) — unified Ollama + Anthropic dispatcher
- `app/src/lib/server/cardContext.js` (new) — builds card context blocks for agents
- `app/src/app/api/arbiter/route.js` (modified) — routes to Ollama via callModelMessages
- `app/src/components/MTGAssistant.jsx` (modified) — provider toggle, modelStatus polling
- `app/src/components/mtg/AppHeader.jsx` (modified) — Local/API toggle UI, cost badge

**42bba63** — Deck context lock. Contains:
- `app/src/hooks/useChatAgents.js` (modified) — createDeckLock, lockContext, per-agent labels
- `app/src/lib/chatPersistence.js` (modified) — saves/loads both histories AND locks

**306f638** — TODOS.md additions (P2/P3 deferred items)

### What these commits leave INCOMPLETE (your todo list)

See below. Tasks are listed T1 → T13 in implementation order.

---

## Task Status

| Task | Status | Commit |
|------|--------|--------|
| T1 — AbortController + model-not-found | ✅ DONE | 76b733e |
| T2 — Path swap to scryfall-bulk/ | ✅ DONE | 76b733e |
| T3 — modelStatus post-send refresh | ✅ DONE | 8ff51f5 |
| T4 — Fix OLLAMA_MODEL to 32b + README | ✅ DONE | 76b733e |
| T5 — SSE streaming | ✅ DONE | 1cc354f |
| T6 — Error bubble + fallback chip | ✅ DONE | 8ff51f5 |
| T7 — Fact Receipt metadata | ✅ DONE | 8ff51f5 |
| T8 — Trust Strip | ✅ DONE | 8ff51f5 |
| T9 — Versioning fields in createDeckLock | ✅ DONE | 76b733e |
| T10 — Arbiter status field | ✅ DONE | 76b733e (server) + 99839fd (client wire-through) |
| T11 — Dataset Tier Manifest | ✅ DONE | 9058277 |
| T12 — Smoke test | 🔲 NOT DONE — run this next |  |
| T13 — Still thinking + Trust Strip dev-open | ✅ DONE | 8ff51f5 |

**Sprint is code-complete. T12 (smoke test) is all that remains.**

### Late-session bug fixes (commit 99839fd)

Once-over review caught two issues with T6+T10 wire-through:
1. **fetchArbiterTrace** was called with `provider: modelProvider` instead of `provider: forceProvider || modelProvider`. When user clicks "Retry with Anthropic ↗" after an Ollama failure, the main response correctly routes to Anthropic — but the Arbiter trace would still try Ollama and fail with the same error. Fixed: now passes `forceProvider || modelProvider`.
2. **T10 client wire-through** was missing. The Arbiter route returns `status` per T10, but `fetchArbiterTrace()` was only extracting `data.trace`. Fixed: now returns `{trace, status}`. `responseMeta.arbiterStatus` is attached to messages. ChatPanel surfaces a visible warning banner above the trace when status is `citation_failed`. The status also shows in parentheses next to "View Arbiter Trace".

---

## Task List — Priority Order

### T1 — AbortController 120s timeout + model-not-found error  
**Priority**: P0  
**Estimated time**: 10 min  
**File**: `app/src/lib/server/modelProvider.js`  
**Status**: ✅ DONE (commit 76b733e)

**Problem**: `callOllamaMessages()` calls `fetch()` with no timeout and no `signal`. If Ollama runs out of VRAM (OOM), the request hangs forever → infinite spinner in UI with no recovery path.

**What to change**:

In `callOllamaMessages()` (starting around line 156), add an AbortController with 120-second timeout. Also add specific error detection for "model not found" (Ollama returns this when the model hasn't been pulled yet).

```javascript
export async function callOllamaMessages(body = {}) {
  const baseUrl = process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL;
  const model = process.env.OLLAMA_MODEL || body.ollamaModel || DEFAULT_OLLAMA_MODEL;
  const system = body.system ? [{ role: "system", content: body.system }] : [];
  const messages = [...system, ...(body.messages || [])].map(message => ({
    role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
    content: String(message.content || ""),
  }));

  // ADD: AbortController with 120s timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,                                    // ADD THIS LINE
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          num_predict: maxTokensFrom(body.max_tokens),
          num_ctx: ollamaContextFrom(body.ollamaContext),
        },
      }),
    });

    clearTimeout(timeoutId);                                        // ADD THIS LINE
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // ADD: model-not-found detection
      const isModelMissing = String(data.error || "").toLowerCase().includes("model") &&
        (String(data.error || "").toLowerCase().includes("not found") ||
         String(data.error || "").toLowerCase().includes("pull"));
      const errorMsg = isModelMissing
        ? `Ollama model "${model}" is not pulled. Run: ollama pull ${model}`
        : (data.error || data.message || "Ollama request failed.");
      const errorResult = providerError(errorMsg, response.status, "ollama", {
        fallbackAvailable: Boolean(anthropicKey()),
        modelMissing: isModelMissing,
        raw: data,
      });
      await recordModelCall({ body, provider: "ollama", model, result: errorResult });
      return errorResult;
    }

    // ... rest of function unchanged
  } catch (error) {
    clearTimeout(timeoutId);                                        // ADD THIS LINE
    // ADD: distinguish timeout from network error
    const isTimeout = error?.name === "AbortError";
    const errorMsg = isTimeout
      ? "Ollama request timed out after 120s. The model may be OOM or the server is overloaded."
      : "Could not reach Ollama at localhost:11434. Is Ollama running? Start with: ollama serve";
    const result = providerError(errorMsg, isTimeout ? 504 : 502, "ollama", {
      fallbackAvailable: Boolean(anthropicKey()),
      timeout: isTimeout,
    });
    await recordModelCall({ body, provider: "ollama", model, result });
    return result;
  }
}
```

**Verify**: After implementing, send a message to Jace in Local mode. Should respond. Then stop Ollama and try again — should see the "Could not reach Ollama" error within 2 seconds (not after 120s, because the connection fails immediately when Ollama is not running).

---

### T2 — Path swap: wire both files to scryfall-bulk/  
**Priority**: P0  
**Estimated time**: 5 min  
**Files**: `app/src/app/api/cards/route.js` AND `app/src/lib/server/cardContext.js`  
**Status**: ✅ DONE (commit 76b733e)

**Problem**: Both files still load from `data/scryfall.oracle.local.json` (the old 76MB partial cache). The full 165MB oracle file is at `data/scryfall-bulk/oracle_cards.json` and the rulings are at `data/scryfall-bulk/rulings.json`. The bulk files exist on disk — confirmed.

**Changes needed — `app/src/app/api/cards/route.js`** (lines 6-8):
```javascript
// BEFORE:
const DATA_DIR = path.join(process.cwd(), "data");
const ORACLE_FILE = path.join(DATA_DIR, "scryfall.oracle.local.json");
const RULINGS_FILE = path.join(DATA_DIR, "scryfall.rulings.local.json");

// AFTER:
const DATA_DIR = path.join(process.cwd(), "data");
const ORACLE_FILE = path.join(DATA_DIR, "scryfall-bulk", "oracle_cards.json");
const RULINGS_FILE = path.join(DATA_DIR, "scryfall-bulk", "rulings.json");
```

**Changes needed — `app/src/lib/server/cardContext.js`** (lines 4-5):
```javascript
// BEFORE:
const ORACLE_FILE = path.join(DATA_DIR, "scryfall.oracle.local.json");
const RULINGS_FILE = path.join(DATA_DIR, "scryfall.rulings.local.json");

// AFTER:
const ORACLE_FILE = path.join(DATA_DIR, "scryfall-bulk", "oracle_cards.json");
const RULINGS_FILE = path.join(DATA_DIR, "scryfall-bulk", "rulings.json");
```

**Note on data format**: The raw Scryfall bulk `oracle_cards.json` is a flat JSON array (not `{ cards: [...] }`). Both `loadOracle()` functions already handle this:
```javascript
const cards = Array.isArray(parsed) ? parsed : parsed.cards;
```
Similarly for rulings:
```javascript
const rulings = Array.isArray(parsed) ? parsed : parsed.rulings;
```
No additional changes needed for format compatibility.

**Verify**: After restarting the dev server (see .next cache note below), do a card lookup:  
`GET /api/cards?name=Sol+Ring` — should return Oracle text from the bulk data.  
Ask Karn "What does [[Sol Ring]] do?" — should cite `{W}` not some old text.

---

### T3 — modelStatus polling refresh after send  
**Priority**: P1  
**Estimated time**: 10 min  
**File**: `app/src/components/MTGAssistant.jsx`  
**Status**: 90% DONE — polling already wired, missing post-send refresh

**What's already done**: Lines 140-156 of `MTGAssistant.jsx` contain a `useEffect` that fetches `/api/model-calls` on mount and every 30 seconds. The AppHeader badge ("Local N | API N") is connected.

**What's missing**: When the user sends a message, the counter doesn't refresh until the 30-second timer fires. The user sends a message and sees the same count for up to 30 seconds.

**Fix**: Pass a `refreshModelStatus` function from MTGAssistant into useChatAgents, or simply export the `loadModelStatus` function from the useEffect so it can be called after `send()` completes.

Simplest approach: extract `loadModelStatus` from the useEffect into a ref:

```javascript
// In MTGAssistant.jsx, replace the modelStatus useEffect:
const refreshModelStatus = useRef(null);
useEffect(() => {
  let active = true;
  const load = async () => {
    try {
      const response = await fetch("/api/model-calls", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      if (active) setModelStatus(data);
    } catch {}
  };
  refreshModelStatus.current = load;
  load();
  const timer = window.setInterval(load, 30000);
  return () => {
    active = false;
    window.clearInterval(timer);
  };
}, []);
```

Then pass `refreshModelStatus` to `useChatAgents` and call `refreshModelStatus.current?.()` at the end of the `send()` function (after `setSending(false)`).

**Note**: This is P1 but not blocking. The 30-second polling is already functional. Skip this if time is short.

---

### T4 — Fix .env.local.example OLLAMA_MODEL  
**Priority**: P1  
**Estimated time**: 5 min  
**File**: `app/.env.local.example`  
**Status**: ✅ DONE (commit 76b733e)

**Problem**: `.env.local.example` has `OLLAMA_MODEL=qwen2.5:14b`. The plan specifies `qwen2.5:32b` as the target model. The 14B model produces notably lower-quality outputs.

**Change**:
```
# BEFORE:
OLLAMA_MODEL=qwen2.5:14b

# AFTER:
OLLAMA_MODEL=qwen2.5:32b
```

Also add a brief Ollama setup comment to the file:
```
# Ollama setup: install from https://ollama.com, then run:
#   ollama serve
#   ollama pull qwen2.5:32b
```

**Also update README.md** with 2-3 lines in the setup section:
```markdown
## Local Model Setup (Ollama)

1. Install Ollama: https://ollama.com
2. Start the server: `ollama serve`
3. Pull the model: `ollama pull qwen2.5:32b`
4. Set `OLLAMA_MODEL=qwen2.5:32b` in `app/.env.local`
```

---

### T5 — SSE streaming end-to-end  
**Priority**: P1  
**Estimated time**: 45 min  
**Files**: `app/src/lib/server/modelProvider.js`, `app/src/hooks/useChatAgents.js`, `app/src/components/mtg/ChatPanel.jsx`  
**Status**: NOT DONE

**Problem**: Both Ollama and Anthropic currently use `await response.json()` — responses appear all at once. No streaming. For a 400-word Karn analysis over Ollama at 30 tok/s, the user stares at a blank bubble for ~13 seconds.

**Architecture**: The API route (`/api/anthropic`) can't stream directly from the browser via `fetch()` today because it normalizes the response to JSON. The streaming needs to run through a Server-Sent Events (SSE) route or a passthrough stream.

**Approach (recommended)**:
1. Add a new `/api/chat-stream` route that accepts the same body as `/api/anthropic` but returns an SSE stream.
2. For Ollama: forward the NDJSON stream from `localhost:11434/api/chat` (with `stream: true`) through the SSE route.
3. For Anthropic: forward the SSE stream from `api.anthropic.com/v1/messages` (with `stream: true`) through the SSE route.
4. In `useChatAgents.js`, detect when streaming is available and switch the `fetch` call to the SSE route; use `EventSource` or `ReadableStream` to consume tokens as they arrive.
5. In `ChatPanel.jsx`, replace the bubble placeholder with a streaming text accumulator.

**Ollama NDJSON format**: Each line is a JSON object like:
```json
{"model":"qwen2.5:32b","message":{"role":"assistant","content":" tokens"},"done":false}
{"model":"qwen2.5:32b","message":{"role":"assistant","content":""},"done":true,"eval_count":42}
```
Read lines with a `TextDecoder` on the response body reader until `done: true`.

**Anthropic SSE format**: Each line is `data: {...}` with event type. Content delta events look like:
```
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" token"}}
```

**Note**: Streaming is the biggest UX improvement in the sprint. It makes Ollama feel responsive even at 20 tok/s. Prioritize this after T1/T2/T4.

---

### T6 — Error bubble + fallback chip  
**Priority**: P1  
**Estimated time**: 20 min  
**Files**: `app/src/hooks/useChatAgents.js`, `app/src/components/mtg/ChatPanel.jsx`  
**Status**: NOT DONE

**Problem**: When `callOllamaMessages` returns an error (after T1 is in place), the catch block in `send()` just inserts "Connection error. Please try again." with no actionable next step.

**What to build**:
1. In `useChatAgents.js` send function, on error response from the model API, include error metadata in the assistant message:
   ```javascript
   setHistories(previous => ({
     ...previous,
     [targetAgent]: [...baseHistory, {
       role: "assistant",
       content: data.error || "No response from local model.",
       isError: true,
       fallbackAvailable: data.fallbackAvailable || Boolean(process.env.ANTHROPIC_API_KEY),
       provider: data.provider || modelProvider,
       errorRaw: data,
     }],
   }));
   ```

2. In `ChatPanel.jsx`, when a message has `isError: true`, render it differently:
   - Red/orange border on the bubble
   - "⚠ Local model error: [message]" text
   - If `fallbackAvailable`, render a chip below the bubble:
     `[Retry with Anthropic ↗]` — clicking this calls `send()` with the same prompt but `provider: "anthropic"` forced.

3. The fallback chip should be rendered inline below the error bubble (not in a menu). Simple `<button>` styled as a chip:
   ```jsx
   {msg.isError && msg.fallbackAvailable && (
     <button onClick={() => retryWithFallback(msg)} style={{...chipStyle}}>
       Retry with Anthropic ↗
     </button>
   )}
   ```

4. Add `retryWithFallback(msg)` to useChatAgents that calls `send()` with `provider: "anthropic"` overriding `modelProvider`.

---

### T7 — Fact Receipt metadata per response  
**Priority**: NEW (Codex addition)  
**Estimated time**: 30 min  
**File**: `app/src/hooks/useChatAgents.js`  
**Status**: NOT DONE

**What**: Add a structured metadata object to every assistant message that records what local data was attached.

**Implementation**: `responseMeta` already exists in `send()`. Currently it only gets `arbiterTrace`. Expand it:

```javascript
// In send(), after building all context:
responseMeta.factReceipt = {
  cardsProvided: countCardsInContext(cardContext + deckOracleContext + karnScryfallContext),
  rulingsProvided: countRulingsInContext(cardContext + deckOracleContext),
  engineContextProvided: Boolean(engineContext),
  arbiterTraceProvided: Boolean(responseMeta.arbiterTrace),
  fallbackUsed: false,   // set to true if Anthropic was used despite modelProvider="ollama"
  provider: modelProvider,
  deckLocked: Boolean(deckLock),
  deckName: deckLock?.name || null,
};
```

Helper functions (simple regex counts):
```javascript
function countCardsInContext(text) {
  return (text.match(/^\[([^\]]+)\]/gm) || []).length;
}
function countRulingsInContext(text) {
  return (text.match(/WOTC RULINGS:/gm) || []).length;
}
```

The fact receipt is consumed by T8 (Trust Strip). Store it on the message object.

---

### T8 — Trust Strip per message  
**Priority**: NEW (Codex addition)  
**Estimated time**: 20 min  
**File**: `app/src/components/mtg/ChatPanel.jsx`  
**Status**: NOT DONE

**What**: A collapsed `<details>` element below each assistant message that shows what data backed the response. Design decision (from /autoplan): collapsed by default in production, open by default in dev mode.

**What to show inside the Trust Strip**:
```
Provider: Local (Ollama qwen2.5:32b)  |  Deck: Sliver Hivelord  |  Cards: 8  |  Rules: 3  |  Cloud: not used
```

**Implementation**: In ChatPanel.jsx, after rendering the assistant message text, check for `message.factReceipt`:

```jsx
{msg.factReceipt && (
  <details open={process.env.NODE_ENV === "development"} style={{marginTop: 6, fontSize: 11, color: "#7f8aa3"}}>
    <summary style={{cursor: "pointer", userSelect: "none", listStyle: "none"}}>
      ▸ Response metadata
    </summary>
    <div style={{padding: "4px 0", lineHeight: 1.6}}>
      <span>Provider: {msg.factReceipt.provider === "ollama" ? "Local (Ollama)" : "Anthropic API"}</span>
      {msg.factReceipt.deckLocked && <span> | Deck: {msg.factReceipt.deckName}</span>}
      {msg.factReceipt.cardsProvided > 0 && <span> | Cards: {msg.factReceipt.cardsProvided}</span>}
      {msg.factReceipt.rulingsProvided > 0 && <span> | Rulings: {msg.factReceipt.rulingsProvided}</span>}
      <span> | Cloud: {msg.factReceipt.provider === "ollama" && !msg.factReceipt.fallbackUsed ? "not used" : "used"}</span>
    </div>
  </details>
)}
```

Also: if `msg.provider === "anthropic"` (from the fallback chip T6), add a small label to the message header: "[via Anthropic]" in a muted style.

---

### T9 — Versioning fields in createDeckLock  
**Priority**: NEW (Codex addition)  
**Estimated time**: 5 min  
**File**: `app/src/hooks/useChatAgents.js`  
**Status**: ✅ DONE (commit 76b733e)

**What**: `createDeckLock()` currently snapshots the deck but doesn't record which version of card data or rules was used. If Scryfall data is refreshed mid-conversation, the locked deck context becomes stale relative to the new data.

**Change**: Add 3 fields to `createDeckLock()`:

```javascript
function createDeckLock(deck) {
  if (!deck) return null;
  return {
    id: deck.id,
    name: deck.name || "Unnamed deck",
    owner: deck.memory?.owner || "Colton",
    commander: deckCommander(deck),
    commanderNames: deckCommanderNames(deck),
    mainCount: deckMainCount(deck),
    tokenCount: deckTokenCount(deck),
    lockedAt: new Date().toISOString(),
    // ADD THESE THREE:
    schemaVersion: 1,
    cardDataVersion: null,   // TODO: populate from oracle manifest scryfallUpdatedAt
    rulesVersion: null,      // TODO: populate from mtg-judge META file
    // END ADDITIONS
    cardNames: deckOracleCardNamesFromCards(deck.cards || []),
    deckText: serializeDeck(deck.cards || []),
    memoryText: serializeDeckMemory(deck),
  };
}
```

Phase 3 will wire in the actual version values. `null` is correct for now — it means "version unknown" which is honest.

---

### T10 — Arbiter status field  
**Priority**: NEW (Codex addition)  
**Estimated time**: 10 min  
**File**: `app/src/app/api/arbiter/route.js`  
**Status**: ✅ DONE (commit 76b733e)

**What**: The Arbiter route currently returns `{ provider, trace }`. Add a `status` field from a controlled vocabulary: `resolved | unresolved | needs_clarification | citation_failed`.

**Detect from trace text**:
```javascript
function detectArbiterStatus(trace) {
  if (!trace) return "unresolved";
  if (/^UNRESOLVED/m.test(trace)) return "unresolved";
  if (/needs.{0,20}clarification/i.test(trace)) return "needs_clarification";
  if (/no.{0,20}(citation|codex|rule number)/i.test(trace)) return "citation_failed";
  if (/RESOLUTION/m.test(trace) && /RULE TRACE/m.test(trace)) return "resolved";
  return "unresolved";
}
```

**Change in route.js**: 
```javascript
return Response.json({
  provider: result.provider,
  trace: result.data.content?.[0]?.text || "",
  status: detectArbiterStatus(result.data.content?.[0]?.text || ""),
}, { status: result.status });
```

**In useChatAgents.js**, update `fetchArbiterTrace` to pass `status` back and attach it to `responseMeta`:
```javascript
responseMeta.arbiterTrace = arbiterTrace;
responseMeta.arbiterStatus = arbiterStatus;  // "resolved" | "unresolved" | etc.
```

When `arbiterStatus === "citation_failed"`, surface a small warning: "⚠ Arbiter could not cite a rule for this answer — verify independently."

---

### T11 — Dataset Tier Manifest  
**Priority**: NEW (Codex addition)  
**Estimated time**: 10 min  
**File**: `app/data/scryfall-bulk/tier-manifest.json` (new file)  
**Status**: ✅ DONE (commit 9058277)

**What**: A JSON document that classifies each local data source by tier, so agents and the app know which data is authoritative vs supplementary.

**Content**:
```json
{
  "version": 1,
  "generatedAt": "2026-05-24",
  "tiers": {
    "required": {
      "description": "Must be present for the app to function",
      "sources": [
        {
          "id": "scryfall_oracle",
          "path": "data/scryfall-bulk/oracle_cards.json",
          "description": "Oracle card text — canonical source for all card behavior",
          "sizeApprox": "165MB"
        },
        {
          "id": "scryfall_rulings",
          "path": "data/scryfall-bulk/rulings.json",
          "description": "Official WotC rulings indexed by oracle_id",
          "sizeApprox": "24MB"
        }
      ]
    },
    "validation": {
      "description": "Improves Arbiter accuracy; not required for basic function",
      "sources": [
        {
          "id": "rulesguru",
          "path": "mtg-judge/META_test_cases_rulesguru.md",
          "description": "500 human-verified rules scenarios",
          "count": 500
        },
        {
          "id": "mtg_judge_codex",
          "path": "mtg-judge/",
          "description": "L00-L10 CR verbatim codex files",
          "count": "~120 files"
        }
      ]
    },
    "future": {
      "description": "Phase 3+ — not wired into runtime yet",
      "sources": [
        {
          "id": "scryfall_default_cards",
          "path": "data/scryfall-bulk/default_cards.json",
          "description": "All printings — needed for artwork/price/set lookup",
          "sizeApprox": "400MB",
          "note": "Not loaded into any route yet. P3 work."
        },
        {
          "id": "scryfall_all_cards",
          "path": "data/scryfall-bulk/all_cards.json",
          "description": "Every single printing with all metadata",
          "sizeApprox": "2GB",
          "note": "Probably never needed. Very large."
        },
        {
          "id": "scryfall_unique_artwork",
          "path": "data/scryfall-bulk/unique_artwork.json",
          "description": "One card per artwork — useful for art browsing only",
          "note": "Out of scope for this tool."
        }
      ]
    }
  }
}
```

---

### T12 — Smoke test  
**Priority**: Day 5  
**Estimated time**: 1 hour  
**Files**: None to change — this is a manual run  
**Status**: NOT DONE until T1-T11 are complete

**Run these 4 critical paths** (from the existing test plan):

1. **Karn full brewing session**: Load Sliver Hivelord deck → ask Karn to analyze → verify card references use Oracle text from scryfall-bulk (not old file) → suggest cuts → suggest adds. All 99 cards should be referenced.

2. **Jace rules question with Arbiter**: Ask "what happens when a creature dies with a death trigger and is immediately replaced?" → Jace gives plain-English answer citing rule numbers → "View Arbiter Trace" button appears → click it → trace shows STATE / RESOLUTION / RULE TRACE.

3. **Tibalt roast**: Ask Tibalt to roast the loaded deck → response references actual cards from the deck, not generic insults.

4. **Zero-dollar session**: 10 messages on Local → check model-calls.local.json or the header badge → Anthropic total = 0.

**Run these 3 Codex addition cases** (from the Brewing Session Acceptance Test):

5. **Deck lock survives reload**: Start a Karn chat, lock a deck, hard-reload the page (F5), send another message → Karn still references the same locked deck, not the new active deck.

6. **Kill Ollama mid-request**: Send a long Karn request → immediately stop Ollama while it's generating → within 2s (connection fail) or 120s (timeout), get a clear error message + [Retry with Anthropic ↗] chip.

7. **Æther Vial lookup**: Ask Karn about [[Æther Vial]] → non-ASCII name should resolve correctly via normalizeName. Should not return "Card not found."

---

### T13 — "Still thinking..." + Trust Strip dev-open  
**Priority**: Taste  
**Estimated time**: 20 min  
**Files**: `app/src/components/mtg/ChatPanel.jsx`, `app/src/components/mtg/AppHeader.jsx`  
**Status**: NOT DONE

**Still thinking... text**:
In `ChatPanel.jsx`, there's a `sending` state that currently renders `<Dots>` animation only. After ~10 seconds, add a "Still thinking... (local model may be slow)" text below the dots:

```jsx
{sending && (
  <div>
    <Dots />
    {waitSeconds > 10 && (
      <div style={{fontSize: 11, color: "#7f8aa3", marginTop: 4}}>
        Still thinking… (local model can take 20–60s for long responses)
      </div>
    )}
  </div>
)}
```

Track wait time with a `useEffect` that sets a `waitSeconds` counter while `sending === true`.

**Trust Strip dev-open**: Already designed in T8 — `<details open={process.env.NODE_ENV === "development"}>`.

---

## Key Files Reference

| File | Purpose | Current state |
|------|---------|---------------|
| `app/src/lib/server/modelProvider.js` | Ollama + Anthropic dispatcher | Missing AbortController (T1) |
| `app/src/app/api/cards/route.js` | Card lookup, search | Wrong oracle path (T2) |
| `app/src/lib/server/cardContext.js` | Card context for Arbiter | Wrong oracle path (T2) |
| `app/src/components/MTGAssistant.jsx` | Root component | modelStatus polling done; missing post-send refresh (T3) |
| `app/.env.local.example` | Env var template | OLLAMA_MODEL wrong (T4) |
| `app/src/hooks/useChatAgents.js` | Chat send, history, locks | send() uses /api/anthropic (old name), no streaming, no error chip |
| `app/src/components/mtg/ChatPanel.jsx` | Chat UI | No error bubble, no Trust Strip |
| `app/src/app/api/arbiter/route.js` | Rules engine | No status field (T10) |
| `app/src/components/mtg/AppHeader.jsx` | Header, badge, toggle | Fully wired — only shows badge when modelStatus is non-null |
| `app/src/lib/chatPersistence.js` | Chat save/load | Fully implemented — saves histories + locks |
| `data/scryfall-bulk/` | Bulk Scryfall data | All 5 files present |
| `app/data/scryfall.oracle.local.json` | Old partial oracle | 76MB — being replaced by T2 |

---

## Data Paths (confirmed)

```
app/data/scryfall-bulk/oracle_cards.json    ← 165MB, flat array of card objects
app/data/scryfall-bulk/rulings.json         ← 24MB, flat array of ruling objects  
app/data/scryfall-bulk/all_cards.json       ← ~2GB, future use only
app/data/scryfall-bulk/default_cards.json   ← ~400MB, future use only
app/data/scryfall-bulk/unique_artwork.json  ← future use only
app/data/scryfall-bulk/manifest.json        ← Scryfall bulk manifest file
app/data/scryfall.oracle.local.json         ← OLD, 76MB partial cache — still there, not needed after T2
app/data/model-calls.local.json             ← Model call log (auto-created, last 1000 entries)
```

---

## .next Cache Warning

When the Next.js dev server is restarted or after `npm run build`, stale `.next/` artifacts frequently cause 500 errors. Standard fix before testing:

1. Kill all Node processes for this project
2. Delete `app/.next/`
3. Run `npm run dev` from the `app/` directory
4. Wait for "Ready" before testing

This is expected behavior, not a bug.

---

## TODOS.md Deferred (post-sprint)

These are in `TODOS.md` in the project root. Do not work on them during this sprint:

- **P2**: Ollama startup health check (ping localhost:11434 on app load, show banner if not ready)
- **P3**: Rename `/api/anthropic` to `/api/chat` (and update `useChatAgents.js` line 486)
- **P3**: Pre-build oracle name index (`scripts/build-oracle-index.js`) for faster cold starts
- **P3**: Consolidate duplicate oracle caches into `app/src/lib/server/oracleStore.js`

---

## Success Criteria (Day 5)

- [ ] Jace answers a rules question through Ollama with zero Anthropic calls
- [ ] Karn analyzes the Sliver Hivelord deck through Ollama with zero Anthropic calls
- [ ] Cost counter shows $0 for a full session with Ollama
- [ ] Manual fallback chip sends a single message through Anthropic and returns to Ollama default
- [ ] `/api/cards` returns cards from `scryfall-bulk/oracle_cards.json` (not old 76MB file)
- [ ] Deck context does not drift mid-conversation when sidebar deck is changed
- [ ] Arbiter trace shows a citation-fail warning when local model answer has no codex citation
- [ ] T12 cases 5 and 6 pass (deck lock survives reload; Ollama kill gives clean error)
- [ ] [[Æther Vial]] resolves correctly

---

## Known Risks / Smoke Test Notes

These are implementation details to verify during T12. All are expected to work but haven't been live-tested against a running Ollama instance.

### T5 Streaming — things to verify

1. **Streaming placeholder replaces correctly**: The placeholder message (content: "", streaming: true) should be replaced by the final message (content: full reply, streaming removed) when done. If it stays as streaming or content is empty, there's a state index bug in `useChatAgents.js` around `streamingIdx`.

2. **Arbiter retry path**: The Arbiter auto-retry logic in `send()` (line ~501) still calls `send()` recursively with `retryDepth = 1`. The streaming flow handles this correctly because `baseHistory` is passed through, but verify the retry case produces a visible response.

3. **Ollama NDJSON format**: Verified against Ollama docs — `event.message.content` is the token field. Some older Ollama versions use `event.response` instead. The parser handles both: `event.message?.content || event.response || ""`.

4. **Anthropic SSE format**: Verified against Anthropic docs. The `message_delta` event with `usage` field comes before `message_stop`. Both are handled. Input tokens aren't always in message_delta; that's OK — we log what we have.

5. **Model call log with streaming**: The streaming route logs after `controller.close()` using `.catch()` — it's fire-and-forget from the stream. Verify `data/model-calls.local.json` gets a new entry after each streamed message.

6. **factReceipt with streaming**: `data.provider` is now set from `streamDoneEvent?.provider`. If `streamDoneEvent` is null (stream ended without a done event), `data.provider` falls back to `forceProvider || modelProvider`. This is correct behavior.

### T6 Error chip — things to verify

7. **Retry with Anthropic chip**: When Ollama is stopped mid-request or before the request, the error message should appear with a "Retry with Anthropic ↗" chip. Clicking it should call `retryWithFallback(msg.originalPrompt, agent)`, which pops the error message and resends with `forceProvider="anthropic"`. Verify the error message is gone and the Anthropic response appears.

8. **fallbackAvailable flag**: The streaming error events include `fallbackAvailable: Boolean(anthropicKey())`. If `ANTHROPIC_API_KEY` is not set in `.env.local`, `fallbackAvailable` will be `false` and the chip won't appear. This is correct — can't retry with Anthropic if no key.

### T2 Path swap — cold start

9. **First card lookup after restart**: After deleting `.next/` and restarting `npm run dev`, the first `/api/cards` request will parse the 165MB `oracle_cards.json`. This takes 3-5 seconds. Subsequent requests are cached. This is expected and documented in TODOS.md (P3: pre-build oracle name index).

10. **Both oracle caches still separate**: `cardContext.js` and `api/cards/route.js` each load oracle independently on cold start. ~900MB peak. Tolerable at 32GB RAM. Fix is P3 in TODOS.md (`oracleStore.js`).

11. **T10 Arbiter status visible**: When asking Jace a rules question that the local model can answer but doesn't cite a rule for, the Arbiter trace should show `(citation_failed)` and an inline warning banner. Test prompt: ask Jace "what's the rule about hexproof?" — if Ollama answers without citing rule 702.11, you should see the warning.

12. **Arbiter retry with Anthropic**: Stop Ollama, ask Jace a rules question, click "Retry with Anthropic ↗" on the error. Both the main response AND the Arbiter trace should now route to Anthropic. Previously (before commit 99839fd) the trace would still try Ollama and silently fail.

### API surface changes this sprint

- **NEW**: `/api/chat-stream` (SSE) — all chat traffic routes here
- **DEAD**: `/api/anthropic` (JSON) — no longer called from anywhere; left in place to avoid scope creep. Removal queued in TODOS.md P3.
- **MODIFIED**: `/api/arbiter` returns `{provider, trace, status}` (added status field)
- **MODIFIED**: `/api/cards` reads from `scryfall-bulk/oracle_cards.json` (was `scryfall.oracle.local.json`)
- **UNCHANGED**: `/api/model-calls`, `/api/decks`, `/api/chats`, `/api/engine`, `/api/symbolic-engine`

---

## What's Deferred to Phase 2

After this sprint completes, the next phase builds the unified knowledge layer:
1. Full Scryfall bulk sync with indexes (name→card, color→cards, etc.)
2. RulesGuru maximum import
3. Wire mtg-judge codex into runtime retrieval
4. Build Arbiter as a real retrieval service
5. Per-chat files (`data/chats/{conversationId}.json`)
6. PGLite for fast index storage

The plan doc at `C:\Users\colto\.gstack\projects\MTG-TOOL\2026-05-23-master-design-phase1.md` covers the full architecture including phases 2-3.

---

*Handoff produced: 2026-05-24*  
*Claude session: eac435de-8557-4d7c-88aa-d43ee9c9c018*
